"""Consulta o armazem de logs do Supabase do jeito certo: dia por dia, juntando as fatias.

Existe porque cada investigacao estava redescobrindo os mesmos limites na marra, e um
deles mente em silencio.

## Os limites, todos medidos em 25/09/2026

  - O endpoint e `analytics/endpoints/logs`. O antigo `logs.all` responde 410 -- e traz o
    nome do substituto na propria mensagem.
  - A tabela e UMA so, chamada `logs`. `edge_logs`, `function_edge_logs`, `postgres_logs`
    e companhia respondem `Table "X" does not exist`: sao nomes obsoletos, nao ausencia.
  - **A JANELA E TRAVADA EM 24h a partir do `iso_timestamp_start`, e a API NAO AVISA.**
    Pedir 30 dias devolve HTTP 200 com as primeiras 24h. Uma consulta larga parece
    "quase nao houve trafego" quando na verdade respondeu uma fatia. E a razao de existir
    deste arquivo: a chamada dar certo nao prova o escopo do que ela respondeu.
  - So existem 3 campos: `id`, `timestamp`, `event_message`. `metadata` e `level` nao
    existem, e `select *` devolve lista VAZIA em vez de erro. O filtro e `like` sobre
    string crua, no formato `"POST | 200 | <url>"`.
  - Throttle agressivo: poucas consultas seguidas devolvem `ThrottlerException`. O padrao
    aqui e ~90s entre dias, com recuo progressivo em cima disso.
  - Retencao alcanca >=90 dias.

Varrer 90 dias custa ~90 consultas, ~2,5h. Use `--dias` pequeno quando der.

Uso:
    python scripts/pericia_logs.py --like "%request-password-reset%" --dias 7
    python scripts/pericia_logs.py --like "%[api-error%" --dias 7 --contar
    python scripts/pericia_logs.py --sql "select count(*) as n from logs where ..." --dias 3

Token: `SUPABASE_ACCESS_TOKEN` do `.env` na raiz (ou variavel de ambiente).
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# O console do Windows nasce em cp1252 e troca cada acento por '?'. As mensagens do log
# sao em portugues, entao sem isto a saida fica ilegivel justamente na parte que importa.
for _fluxo in (sys.stdout, sys.stderr):
    if hasattr(_fluxo, "reconfigure"):
        _fluxo.reconfigure(encoding="utf-8", errors="replace")

RAIZ = pathlib.Path(__file__).resolve().parents[1]
REF = "swfshqvvbohnahdyndch"
BASE = f"https://api.supabase.com/v1/projects/{REF}/analytics/endpoints/logs"

# A API trava a janela em 24h. Pedir mais devolve 200 com a primeira fatia, entao o
# passo do laco TEM que ser 24h -- nao e conservadorismo, e o tamanho real da resposta.
FATIA = timedelta(hours=24)
ESPERA = 90.0


def token() -> str:
    import os

    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        return os.environ["SUPABASE_ACCESS_TOKEN"].strip()
    env = RAIZ / ".env"
    if env.exists():
        for linha in env.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)", linha)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    sys.exit("SUPABASE_ACCESS_TOKEN nao encontrado (ambiente ou .env da raiz)")


def consultar(sql: str, inicio: datetime, fim: datetime, tok: str) -> list[dict]:
    """Uma fatia. Recua no throttle em vez de desistir, e distingue throttle de erro real."""
    qs = urllib.parse.urlencode(
        {
            "sql": sql,
            "iso_timestamp_start": inicio.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "iso_timestamp_end": fim.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
    )
    req = urllib.request.Request(f"{BASE}?{qs}", headers={"Authorization": f"Bearer {tok}"})

    espera = ESPERA
    for tentativa in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                corpo = json.loads(r.read().decode("utf-8", errors="replace"))
        except Exception as e:  # rede, timeout
            print(f"    rede falhou ({e}); nova tentativa em {espera:.0f}s", file=sys.stderr)
            time.sleep(espera)
            espera *= 1.5
            continue

        # O throttle chega com HTTP 200 e corpo de mensagem -- nao levanta excecao.
        msg = corpo.get("message", "")
        if "Throttler" in msg or "Too Many Requests" in msg:
            print(f"    throttle; aguardando {espera:.0f}s", file=sys.stderr)
            time.sleep(espera)
            espera *= 1.5
            continue
        if "Backend error" in msg:
            print(f"    backend reclamou; aguardando {espera:.0f}s", file=sys.stderr)
            time.sleep(espera)
            espera *= 1.5
            continue

        # `error` e resposta legitima do motor (nome de campo/tabela errado). Nao adianta
        # repetir: o proximo dia daria o mesmo. Para na hora e diz o que foi.
        if "error" in corpo:
            sys.exit(f"consulta recusada: {corpo['error']}")
        if "message" in corpo and "result" not in corpo:
            sys.exit(f"resposta inesperada: {msg}")
        return corpo.get("result", [])

    sys.exit("throttle persistente depois de 5 tentativas -- rode de novo mais tarde")


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--like", help="padrao para `event_message like ...` (use %% nas pontas)")
    g.add_argument("--sql", help="SQL completo; a janela continua sendo aplicada por fatia")
    p.add_argument("--dias", type=int, default=7, help="quantos dias para tras (default 7; retencao >=90)")
    p.add_argument("--contar", action="store_true", help="so a contagem por dia, sem as linhas")
    p.add_argument("--limite", type=int, default=200, help="linhas por dia quando nao e --contar")
    p.add_argument("--espera", type=float, default=ESPERA, help="segundos entre dias (default 90)")
    a = p.parse_args(argv)

    tok = token()
    agora = datetime.now(timezone.utc).replace(microsecond=0)

    if a.sql:
        sql = a.sql
    elif a.contar:
        sql = f"select count(*) as n from logs where event_message like '{a.like}'"
    else:
        sql = (
            f"select timestamp, event_message from logs where event_message like '{a.like}' "
            f"order by timestamp desc limit {a.limite}"
        )

    print(f"# fatias de 24h, {a.dias} dia(s), ~{a.espera:.0f}s entre elas "
          f"(~{a.dias * a.espera / 60:.0f} min)\n# sql: {sql}\n")

    total = 0
    linhas: list[dict] = []
    for i in range(a.dias):
        fim = agora - FATIA * i
        inicio = fim - FATIA
        rotulo = inicio.strftime("%d/%m %H:%M") + " -> " + fim.strftime("%d/%m %H:%M")

        r = consultar(sql, inicio, fim, tok)

        if a.contar or (len(r) == 1 and set(r[0]) == {"n"}):
            n = int(r[0]["n"]) if r else 0
            total += n
            print(f"{rotulo}  {n}")
        else:
            total += len(r)
            linhas.extend(r)
            print(f"{rotulo}  {len(r)} linha(s)")
            if len(r) >= a.limite:
                print(f"    ATENCAO: bateu o limite de {a.limite} -- ha mais neste dia")

        if i < a.dias - 1:
            time.sleep(a.espera)

    print(f"\ntotal: {total}")

    if linhas:
        print()
        for l in sorted(linhas, key=lambda x: x.get("timestamp", ""), reverse=True):
            ts = str(l.get("timestamp", ""))[:19]
            msg = str(l.get("event_message", "")).strip().replace("\n", " ")
            print(f"{ts}  {msg[:240]}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
