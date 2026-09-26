"""Segredo em texto puro dentro do codigo versionado.

Motivo de existir: o admintoken da UAZAPI viveu em DOIS arquivos por meses --
`supabase/functions/uzapi-create-instance/index.ts` (servidor) e
`src/lib/uzapi.ts` (NAVEGADOR). O segundo e o grave: tudo em `src/` vira string
literal dentro do bundle publico, entao a credencial de administrador do
provedor estava sendo entregue a cada visitante da aplicacao -- e estava ali
mesmo com o unico consumidor dela sendo codigo morto. Codigo morto nao e
segredo morto.

O que esta barreira mede: os arquivos RASTREADOS pelo git (`git ls-files`).
E o recorte certo, e nao uma limitacao -- `.env`, `supabase/.temp/*.txt` e as
copias de trabalho em `.claude/worktrees/` nao estao versionados, entao nao
viajam para quem clona o repositorio nem para o bundle. O que reprova aqui e o
que foi COMMITADO.

Nao varre o HISTORICO de proposito. Segredo que ja foi commitado nao volta
atras: o conserto e ROTACAO no provedor, nao reescrita de historico -- e
reescrever historico ainda daria a falsa sensacao de que o valor antigo ficou
inacessivel. Quem quiser auditar o passado usa `gitleaks detect` a parte.

Duas familias de padrao:

  - PREFIXO CONHECIDO (`sk-ant-`, `sbp_`, `AIza`, `-----BEGIN ... PRIVATE
    KEY-----`, ...): o formato ja identifica o emissor, quase nao erra.
  - ATRIBUICAO GENERICA (`token = "<40 chars>"`): e o que pega segredo de
    provedor sem formato proprio, que foi exatamente o caso da UAZAPI. Custa
    falso positivo, entao existe a dispensa nominal abaixo -- cada linha
    dispensada com o motivo escrito, nunca um padrao afrouxado.

Uso:
    python supabase/tests/security/item_segredo_no_codigo/check.py

Nao usa rede nem credencial. Sai 1 se achar segredo novo.
NUNCA imprime o valor: so tipo e arquivo:linha.
"""

from __future__ import annotations

import base64
import json
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[4]

# Extensoes que nao contem codigo e cujo conteudo binario/minificado produz
# ruido puro (hash de lockfile casa com "atribuicao generica" o tempo todo).
IGNORA_SUFIXO = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf",
    ".xlsx", ".xls", ".zip", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4",
}
IGNORA_NOME = {"package-lock.json", "deno.lock", "bun.lockb"}

# Caminhos que sao ARQUIVO MORTO no repositorio (dumps, scripts avulsos da
# raiz, fontes recuperadas das functions apagadas). Ficam de fora porque nao
# sao executados nem publicados; se algum dia voltarem a ser, saem daqui.
IGNORA_PREFIXO = (
    "supabase/tests/security/deploy_drift/fontes_recuperadas/",
    "schema_dump.sql",
)

PADROES: list[tuple[str, re.Pattern[str]]] = [
    ("chave privada (PEM)", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("token de acesso Supabase (sbp_)", re.compile(r"\bsbp_[0-9a-f]{40}\b")),
    ("chave secreta Supabase (sb_secret_)", re.compile(r"\bsb_secret_[A-Za-z0-9_\-]{20,}")),
    ("JWT (chave legada Supabase / service role)", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}")),
    ("chave OpenAI (sk-)", re.compile(r"\bsk-(proj-)?[A-Za-z0-9_\-]{32,}")),
    ("chave Anthropic (sk-ant-)", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}")),
    ("chave Google (AIza)", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("chave AWS (AKIA)", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("chave Resend (re_)", re.compile(r"\bre_[A-Za-z0-9_\-]{24,}")),
    ("token Slack (xox)", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("chave Stripe ao vivo (sk_live_)", re.compile(r"\bsk_live_[A-Za-z0-9]{20,}")),
    ("token de usuario Meta (EAA)", re.compile(r"\bEAA[A-Za-z0-9]{80,}")),
    (
        "atribuicao generica de segredo",
        re.compile(
            r"""(?ix)
            \b(admin_?token|api_?key|apikey|secret|password|passwd|senha|
               access_?token|auth_?token|private_?key|client_?secret|service_?key)
            \s* [:=] \s*
            ['"`] ([A-Za-z0-9_\-+/=.]{28,}) ['"`]
            """
        ),
    ),
]

# ── Dispensas nominais ────────────────────────────────────────────────────────
# Cada uma com o motivo escrito. Dispensa e por LINHA (arquivo + trecho), nunca
# por padrao afrouxado: afrouxar o padrao apaga a proxima ocorrencia tambem.
# Trecho casado por substring no conteudo da linha.
DISPENSAS: list[tuple[str, str, str]] = [
    # (prefixo do caminho, substring da linha, motivo)
    (
        "supabase/tests/security/item_segredo_no_codigo/check.py",
        "",
        "o proprio detector: os padroes acima sao regex, nao valores",
    ),
]

# A chave `anon` NAO e segredo: ela e desenhada para viver no bundle do
# navegador, e quem protege os dados atras dela e a RLS. Dispensar por NOME DE
# ARQUIVO seria frouxo -- bastaria colar uma service_role no mesmo arquivo para
# ela passar. Entao a dispensa e pelo CONTEUDO: decodifica o payload do JWT
# (sem validar assinatura, sem rede) e so passa quando o claim `role` e `anon`.
# Qualquer outro papel -- service_role a frente de todos -- reprova.
RE_JWT_PAYLOAD = re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.(eyJ[A-Za-z0-9_\-]{20,})\.[A-Za-z0-9_\-]{10,}")


def jwt_e_anon(linha: str) -> bool:
    m = RE_JWT_PAYLOAD.search(linha)
    if not m:
        return False
    bruto = m.group(1)
    bruto += "=" * (-len(bruto) % 4)
    try:
        claims = json.loads(base64.urlsafe_b64decode(bruto))
    except Exception:
        return False  # nao deu para ler o papel => trata como segredo
    return claims.get("role") == "anon"


def dispensada(caminho: str, linha: str) -> bool:
    for prefixo, trecho, _motivo in DISPENSAS:
        if caminho.startswith(prefixo) and (not trecho or trecho in linha):
            return True
    return False


def arquivos_rastreados() -> list[str]:
    saida = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=RAIZ, capture_output=True, text=True, check=True,
    ).stdout
    return [c for c in saida.split("\0") if c]


def main() -> int:
    achados: list[tuple[str, str, int]] = []

    for rel in arquivos_rastreados():
        if rel.startswith(IGNORA_PREFIXO):
            continue
        p = pathlib.Path(rel)
        if p.suffix.lower() in IGNORA_SUFIXO or p.name in IGNORA_NOME:
            continue

        caminho = RAIZ / rel
        try:
            texto = caminho.read_text(encoding="utf-8", errors="ignore")
        except (OSError, ValueError):
            continue

        for n, linha in enumerate(texto.splitlines(), 1):
            if len(linha) > 2000:  # linha de bundle minificado
                continue
            if dispensada(rel, linha):
                continue
            for tipo, padrao in PADROES:
                if not padrao.search(linha):
                    continue
                if tipo.startswith("JWT") and jwt_e_anon(linha):
                    break
                achados.append((tipo, rel, n))
                break

    if not achados:
        print("ok   nenhum segredo em texto puro nos arquivos rastreados")
        return 0

    print(f"CONFERIR   {len(achados)} segredo(s) em texto puro no codigo versionado\n")
    for tipo, rel, n in sorted(achados, key=lambda a: (a[1], a[2])):
        print(f"  {tipo:<44} {rel}:{n}")
    print(
        "\nConserto: o valor sai do codigo e vira secret do Supabase, lido com\n"
        "Deno.env.get(...) SEM fallback (falha fechada). Remover do codigo NAO\n"
        "invalida a credencial -- ela tem que ser ROTACIONADA no provedor.\n"
        "Falso positivo se dispensa nominalmente em DISPENSAS, com o motivo."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
