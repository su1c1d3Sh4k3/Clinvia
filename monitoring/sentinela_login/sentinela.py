#!/usr/bin/env python3
"""Executor da sentinela: roda a sonda, decide se avisa, e avisa.

Divisao de trabalho
-------------------
`probe.py` so MEDE e devolve verdade crua. Este arquivo decide o que fazer com
ela: quando um tropeco vira incidente, quando avisar, e por onde.

Por que o aviso sai por e-mail direto
-------------------------------------
Esta sentinela e a ultima linha: ela existe para o caso em que a plataforma
esta inacessivel. Um aviso que precise da plataforma para sair morre junto com
o que ele deveria denunciar. Entao o caminho e HTTP direto para a Resend, um
terceiro, sem Supabase no meio.

Isso tambem decide QUAL credencial a caixa externa carrega: **so a chave da
Resend**. Uma maquina fora da plataforma e por definicao menos protegida que
ela; dar a ela uma chave que le o banco inteiro trocaria um buraco de
observabilidade por um buraco de seguranca. A chave da Resend, no pior caso,
manda e-mail.

Confirmacao antes de avisar
---------------------------
Rodando de minuto em minuto, um tropeco de rede de um minuto vira alarme falso
— e alarme falso ensina a ignorar alarme, que e exatamente o que nao pode
acontecer com o canal dele. Por isso o aviso so sai apos CONFIRMACOES passadas
seguidas com a MESMA verificacao quebrada. Isso e supressao na ORIGEM (nao
existe incidente ainda), nao teto na porta: uma vez confirmado, o aviso sai, e
sai de novo a cada LEMBRETE_MIN enquanto durar, sem limite de quantidade.

Uso
---
    # as mesmas variaveis do probe.py, mais:
    export SENTINELA_RESEND_KEY=re_...
    export SENTINELA_EMAIL_PARA=voce@dominio,outro@dominio
    export SENTINELA_ESTADO=/var/lib/sentinela/estado.json   # opcional

    python sentinela.py

Saida: 0 = tudo ok, 1 = ha falha (avisada ou ainda em confirmacao).
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

import probe

# Passadas seguidas com a mesma verificacao quebrada antes de avisar. Em
# cadencia de 1 minuto, 3 = o login esta fora ha 3 minutos. Menos que isso pega
# oscilacao de rede da propria caixa que roda a sonda.
CONFIRMACOES = 3

# Enquanto a falha durar, relembra de tempos em tempos. Nao e teto de envio: e
# cadencia de UM incidente que continua aberto.
LEMBRETE_MIN = 30

ESTADO_PADRAO = "/var/lib/sentinela/estado.json"
RESEND_API = "https://api.resend.com/emails"
REMETENTE = "Sentinela Clinvia <nao-responda@clinbia.ai>"


# ─────────────────────────────── estado ───────────────────────────────

def ler_estado(caminho: str) -> dict:
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        # Estado perdido e recuperavel: a proxima passada reconstroi. O que nao
        # pode e a sentinela morrer por causa do proprio arquivo de rascunho.
        return {}


def gravar_estado(caminho: str, estado: dict) -> None:
    try:
        pasta = os.path.dirname(caminho)
        if pasta:
            os.makedirs(pasta, exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False)
    except OSError as e:
        print(f"aviso: nao consegui gravar o estado em {caminho}: {e}",
              file=sys.stderr)


# ─────────────────────────────── aviso ───────────────────────────────

def enviar_email(chave: str, para: list[str], assunto: str, corpo: str) -> bool:
    req = urllib.request.Request(
        RESEND_API,
        data=json.dumps({
            "from": REMETENTE,
            "to": para,
            "subject": assunto,
            "text": corpo,
        }).encode("utf-8"),
        method="POST",
    )
    # A Resend tambem esta atras da Cloudflare, que recusa `Python-urllib/*`
    # com 403 `error code: 1010` — medido em 24/09/2026. O aviso caia calado
    # justamente na hora em que ele e a unica coisa que importa.
    req.add_header("User-Agent", probe.USER_AGENT)
    req.add_header("Authorization", f"Bearer {chave}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=probe.TIMEOUT) as r:
            return r.status < 300
    except urllib.error.HTTPError as e:
        print(f"resend HTTP {e.code}: {e.read()[:200]!r}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — aviso que falha nao derruba a sonda
        print(f"resend {type(e).__name__}: {e}", file=sys.stderr)
    return False


def corpo_queda(r: dict, falhas: list[dict], minutos: int) -> str:
    linhas = [
        "A aplicacao nao esta acessivel de fora.",
        "",
        f"Fora ha: {minutos} min",
        f"Medido em: {r['quando']}",
        "",
        "O QUE QUEBROU",
    ]
    linhas += [f"  {f['verificacao']}: {f['detalhe']}" for f in falhas]
    linhas += [
        "",
        "O QUE AINDA RESPONDE",
    ]
    ok = [x for x in r["resultados"] if x["ok"]]
    linhas += [f"  {x['verificacao']}: {x['detalhe']}" for x in ok] or ["  nada"]
    linhas += [
        "",
        "Esta medicao vem de fora da plataforma e reproduz o que o NAVEGADOR",
        "faz, inclusive o preflight de CORS. O painel de incidentes pode estar",
        "verde e isto aqui vermelho ao mesmo tempo: sao coberturas diferentes.",
    ]
    return "\n".join(linhas)


def corpo_volta(r: dict, minutos: int) -> str:
    return "\n".join([
        "A aplicacao voltou a responder de fora.",
        "",
        f"Ficou fora: {minutos} min",
        f"Medido em: {r['quando']}",
        "",
        "Todas as verificacoes passaram.",
    ])


# ─────────────────────────────── ciclo ───────────────────────────────

def main() -> int:
    caminho = os.environ.get("SENTINELA_ESTADO", ESTADO_PADRAO)
    chave = os.environ.get("SENTINELA_RESEND_KEY", "")
    para = [e.strip() for e in
            os.environ.get("SENTINELA_EMAIL_PARA", "").split(",") if e.strip()]

    r = probe.rodar()
    estado = ler_estado(caminho)
    agora = int(time.time())
    falhas = [x for x in r["resultados"] if not x["ok"]]
    assinatura = ",".join(sorted(r["falhas"]))

    if not falhas:
        # Volta: so avisa se a queda chegou a ser avisada. Falha que morreu
        # durante a confirmacao nunca existiu para ele, e "voltou" sem "caiu"
        # e ruido puro.
        if estado.get("avisado_em"):
            minutos = max(1, (agora - estado.get("caiu_em", agora)) // 60)
            if chave and para:
                enviar_email(chave, para,
                             f"[SENTINELA] Aplicacao voltou ({minutos} min fora)",
                             corpo_volta(r, minutos))
        gravar_estado(caminho, {"ultima_ok": agora})
        if "--json" in sys.argv:
            print(json.dumps(r, ensure_ascii=False))
        else:
            print(f"ok  {r['quando']}  todas as {len(r['resultados'])} passaram")
        return 0

    # Assinatura diferente = falha diferente: recomeca a contagem. Sem isso,
    # tres quebras distintas em minutos seguidos somariam como se fossem uma.
    seguidas = estado.get("seguidas", 0) + 1 if estado.get("assinatura") == assinatura else 1
    caiu_em = estado.get("caiu_em", agora) if seguidas > 1 else agora
    avisado_em = estado.get("avisado_em", 0) if estado.get("assinatura") == assinatura else 0

    deve_avisar = seguidas >= CONFIRMACOES and (
        not avisado_em or agora - avisado_em >= LEMBRETE_MIN * 60
    )
    if deve_avisar and chave and para:
        minutos = max(1, (agora - caiu_em) // 60)
        if enviar_email(chave, para,
                        f"[SENTINELA] Aplicacao inacessivel: {assinatura}",
                        corpo_queda(r, falhas, minutos)):
            avisado_em = agora

    gravar_estado(caminho, {
        "assinatura": assinatura,
        "seguidas": seguidas,
        "caiu_em": caiu_em,
        "avisado_em": avisado_em,
    })

    if "--json" in sys.argv:
        print(json.dumps({**r, "seguidas": seguidas, "avisado": bool(avisado_em)},
                         ensure_ascii=False))
    else:
        estagio = ("avisado" if avisado_em
                   else f"confirmando {seguidas}/{CONFIRMACOES}")
        print(f"FALHA {r['quando']}  {assinatura}  ({estagio})")
        for f in falhas:
            print(f"      {f['verificacao']}: {f['detalhe']}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
