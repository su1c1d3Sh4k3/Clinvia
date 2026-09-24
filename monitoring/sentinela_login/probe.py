#!/usr/bin/env python3
"""Sentinela de login — verifica de FORA se a aplicacao esta acessivel.

Por que existe
--------------
Em 24/09/2026 o login caiu para todo mundo por uma falha de CORS. O
monitoramento nao viu nada, e nao viu por um motivo estrutural: **falha de CORS
acontece no navegador**. O navegador recusa a chamada ANTES de ela sair, nenhuma
edge function e invocada, nenhuma linha e escrita, nenhum codigo HTTP >= 500
existe. O painel fica verde com a aplicacao inacessivel.

Todo o monitoramento que temos mede o que CHEGA ate o servidor. Esta sonda mede
o que o NAVEGADOR consegue fazer. Sao coberturas diferentes e nao se substituem.

O que ela faz
-------------
Reproduz o caminho do login como um navegador faria, incluindo o preflight que
so o navegador executa. Cada verificacao abaixo falhou, ou teria falhado, em
algum incidente real deste projeto:

  1. front_html        o index.html responde e tem o ponto de montagem do React
  2. front_bundle      o JS que o index.html aponta existe de verdade
                       (deploy que publica index novo apontando hash que nao
                       subiu = tela branca, e o servidor responde 200 em tudo)
  3. preflight         OPTIONS com TODOS os headers que o front manda, contra
                       cada function do caminho de login. ESTE e o incidente de
                       24/09: curl comum passa, navegador nao
  4. verify_turnstile  a function do captcha responde pelo caminho real
  5. auth_health       o GoTrue esta de pe
  6. rest_anon         a leitura anonima que a tela de login faz
  7. login_real        (so com sentinela configurada) grant de senha de verdade,
                       leitura autenticada e logout

As seis primeiras sao leitura pura e podem rodar de minuto em minuto sem deixar
rastro. A setima ESCREVE: cada passada e uma sessao em `auth.sessions` e uma
linha no log de auditoria. A cadencia dela e decidida pelo executor
(`sentinela.py`), nao aqui — ver `--sem-login`.

Fora de qualquer dependencia do projeto de proposito: so biblioteca padrao. O
arquivo e autocontido para poder ser copiado para qualquer executor externo sem
carregar nada da plataforma que ele vigia.

Uso
---
    export SENTINELA_SUPABASE_URL=https://<ref>.supabase.co
    export SENTINELA_ANON_KEY=<chave anon>
    export SENTINELA_APP_ORIGIN=https://app.clinbia.ai
    # opcionais, habilitam a verificacao 7:
    export SENTINELA_EMAIL=...
    export SENTINELA_SENHA=...

    python probe.py              # relatorio legivel, sai 0 se tudo ok
    python probe.py --json       # uma linha JSON, para o executor encadear
    python probe.py --sem-login  # so as 6 de leitura, nao toca em auth

Saida: 0 = tudo ok, 1 = ha falha.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 12

# A Cloudflare esta na frente de app.clinbia.ai e devolve 403 para
# `Python-urllib/*` — medido em 24/09/2026: o MESMO GET responde 200 sem
# User-Agent e 200 com UA de navegador. Como a sonda existe justamente para
# medir o que um NAVEGADOR consegue fazer, ela se apresenta como um.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ClinviaSentinela/1"
)

# Exatamente os headers que o supabase-js manda do navegador. `x-origin` entrou
# em 23/09/2026 e e o que derrubou o login: header custom obriga preflight.
# Se o front passar a mandar outro header, ele PRECISA entrar aqui — senao a
# sonda aprova um preflight que o navegador vai recusar.
HEADERS_DO_FRONT = [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
    "x-origin",
]

# Functions que o caminho de login e a primeira tela atravessam. Nao e a lista
# inteira: a sonda roda de minuto em minuto e precisa ser barata. O repositorio
# tem o guarda que cobre as 130 (tests/security/item_cors_x_origin/check.py).
FUNCTIONS_DO_LOGIN = [
    "verify-turnstile",
    "admin-impersonate",
    "frontend-error-ingest",
]


class Falha(Exception):
    pass


def _ctx() -> ssl.SSLContext:
    return ssl.create_default_context()


def _pedir(metodo: str, url: str, headers: dict | None = None,
           corpo: bytes | None = None) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=corpo, method=metodo)
    req.add_header("User-Agent", USER_AGENT)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=_ctx()) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except Exception as e:  # noqa: BLE001 — rede caiu, DNS, TLS, timeout
        raise Falha(f"{type(e).__name__}: {e}") from e


# ─────────────────────────── verificacoes ───────────────────────────

def ck_front_html(cfg: dict, estado: dict) -> str:
    codigo, _, corpo = _pedir("GET", cfg["app"] + "/", {"Cache-Control": "no-cache"})
    if codigo != 200:
        raise Falha(f"HTTP {codigo}")
    texto = corpo.decode("utf-8", "replace")
    if 'id="root"' not in texto:
        raise Falha("index.html sem o ponto de montagem do React")
    marca = 'type="module" crossorigin src="'
    if marca not in texto:
        raise Falha("index.html sem o script do bundle")
    inicio = texto.index(marca) + len(marca)
    estado["bundle"] = texto[inicio:texto.index('"', inicio)]
    return f"bundle {estado['bundle']}"


def ck_front_bundle(cfg: dict, estado: dict) -> str:
    caminho = estado.get("bundle")
    if not caminho:
        raise Falha("index.html nao entregou o caminho do bundle")
    codigo, cab, corpo = _pedir("GET", cfg["app"] + caminho)
    if codigo != 200:
        raise Falha(f"HTTP {codigo} — index aponta um arquivo que nao existe (tela branca)")
    if len(corpo) < 1000:
        raise Falha(f"bundle com {len(corpo)} bytes, pequeno demais para ser real")
    tipo = cab.get("content-type", "")
    if "javascript" not in tipo:
        raise Falha(f"content-type {tipo!r}, deveria ser javascript")
    return f"{len(corpo) // 1024} KB"


def ck_preflight(cfg: dict, estado: dict) -> str:
    """O unico teste que reproduz o que o navegador faz antes de cada chamada.

    `curl` simples NAO faz preflight — foi por isso que o incidente de 24/09
    passou batido numa medicao manual. Aqui o OPTIONS e explicito e a resposta
    e conferida header a header.
    """
    quebradas = []
    for slug in FUNCTIONS_DO_LOGIN:
        codigo, cab, _ = _pedir(
            "OPTIONS", f"{cfg['url']}/functions/v1/{slug}",
            {
                "Origin": cfg["app"],
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": ",".join(HEADERS_DO_FRONT),
            },
        )
        if codigo >= 400:
            quebradas.append(f"{slug}: preflight HTTP {codigo}")
            continue
        permitidos = {
            h.strip().lower()
            for h in cab.get("access-control-allow-headers", "").split(",")
        }
        faltando = [h for h in HEADERS_DO_FRONT if h not in permitidos]
        if faltando:
            quebradas.append(f"{slug}: nao permite {', '.join(faltando)}")
    if quebradas:
        raise Falha("; ".join(quebradas))
    return f"{len(FUNCTIONS_DO_LOGIN)} functions, {len(HEADERS_DO_FRONT)} headers"


def ck_verify_turnstile(cfg: dict, estado: dict) -> str:
    codigo, _, corpo = _pedir(
        "POST", f"{cfg['url']}/functions/v1/verify-turnstile",
        {
            "Origin": cfg["app"],
            "Authorization": f"Bearer {cfg['anon']}",
            "apikey": cfg["anon"],
            "Content-Type": "application/json",
            "x-client-info": "sentinela-login",
            "x-origin": "front",
        },
        b'{"token":"sentinela"}',
    )
    if codigo != 200:
        raise Falha(f"HTTP {codigo}: {corpo[:160].decode('utf-8', 'replace')}")
    # Token falso deve ser RECUSADO. Se ele for aceito, o captcha esta aberto.
    dados = json.loads(corpo.decode("utf-8", "replace"))
    if dados.get("success") is True:
        raise Falha("captcha aceitou um token invalido")
    return "responde e recusa token falso"


def ck_auth_health(cfg: dict, estado: dict) -> str:
    codigo, _, corpo = _pedir("GET", f"{cfg['url']}/auth/v1/health",
                              {"apikey": cfg["anon"]})
    if codigo != 200:
        raise Falha(f"HTTP {codigo}")
    return json.loads(corpo.decode()).get("version", "?")


def ck_rest_anon(cfg: dict, estado: dict) -> str:
    codigo, _, corpo = _pedir(
        "GET", f"{cfg['url']}/rest/v1/login_design?select=id&limit=1",
        {"Authorization": f"Bearer {cfg['anon']}", "apikey": cfg["anon"],
         "Origin": cfg["app"], "x-origin": "front"},
    )
    if codigo != 200:
        raise Falha(f"HTTP {codigo}: {corpo[:160].decode('utf-8', 'replace')}")
    return "leitura anonima da tela de login ok"


def ck_login_real(cfg: dict, estado: dict) -> str:
    """Grant de senha de verdade com a conta sentinela.

    Sem isto a sonda prova que o login esta ALCANCAVEL, nao que ele FUNCIONA.
    Um login bem-sucedido escreve em auth.sessions e dispara os gatilhos do
    schema auth — caminho que uma tentativa com senha errada nunca exercita.
    """
    if not (cfg.get("email") and cfg.get("senha")):
        return "pulado (conta sentinela nao configurada)"

    codigo, _, corpo = _pedir(
        "POST", f"{cfg['url']}/auth/v1/token?grant_type=password",
        {"apikey": cfg["anon"], "Content-Type": "application/json",
         "Origin": cfg["app"], "x-origin": "front"},
        json.dumps({"email": cfg["email"], "password": cfg["senha"]}).encode(),
    )
    if codigo != 200:
        raise Falha(f"grant HTTP {codigo}: {corpo[:200].decode('utf-8', 'replace')}")
    token = json.loads(corpo.decode()).get("access_token")
    if not token:
        raise Falha("grant devolveu 200 sem access_token")

    # Leitura autenticada: prova que RLS e grants nao derrubam quem acabou de
    # entrar. Foi essa classe que a correcao de seguranca de setembro arriscou.
    codigo, _, corpo = _pedir(
        "POST", f"{cfg['url']}/rest/v1/rpc/check_account_deactivation",
        {"Authorization": f"Bearer {token}", "apikey": cfg["anon"],
         "Content-Type": "application/json", "Origin": cfg["app"],
         "x-origin": "front"},
        b"{}",
    )
    if codigo != 200:
        raise Falha(f"leitura pos-login HTTP {codigo}: "
                    f"{corpo[:200].decode('utf-8', 'replace')}")

    # Nao deixa sessao acumulando: 1440 logins por dia sem logout entopem
    # auth.sessions e ainda tomariam o slot de sessao unica.
    _pedir("POST", f"{cfg['url']}/auth/v1/logout",
           {"Authorization": f"Bearer {token}", "apikey": cfg["anon"]}, b"")
    return "entrou, leu e saiu"


# A UNICA verificacao que escreve. Separada por nome para o executor poder
# rarea-la sem precisar saber o que ela faz.
LOGIN_REAL = "login_real"

VERIFICACOES = [
    ("front_html", ck_front_html),
    ("front_bundle", ck_front_bundle),
    ("preflight", ck_preflight),
    ("verify_turnstile", ck_verify_turnstile),
    ("auth_health", ck_auth_health),
    ("rest_anon", ck_rest_anon),
    (LOGIN_REAL, ck_login_real),
]


def rodar(incluir_login: bool = True) -> dict:
    """Roda as verificacoes. `incluir_login=False` deixa a 7 de fora.

    Quem pula nao e a sonda, e o executor: aqui a passada so fica registrada
    em `login_medido`, para o executor nao confundir "nao mediu" com "passou".
    """
    cfg = {
        "url": os.environ.get("SENTINELA_SUPABASE_URL", "").rstrip("/"),
        "anon": os.environ.get("SENTINELA_ANON_KEY", ""),
        "app": os.environ.get("SENTINELA_APP_ORIGIN", "").rstrip("/"),
        "email": os.environ.get("SENTINELA_EMAIL", ""),
        "senha": os.environ.get("SENTINELA_SENHA", ""),
    }
    faltando = [k for k in ("url", "anon", "app") if not cfg[k]]
    if faltando:
        print("faltam variaveis de ambiente: " + ", ".join(
            "SENTINELA_" + {"url": "SUPABASE_URL", "anon": "ANON_KEY",
                            "app": "APP_ORIGIN"}[k] for k in faltando))
        sys.exit(2)

    estado: dict = {}
    resultados = []
    escolhidas = [(n, f) for n, f in VERIFICACOES
                  if incluir_login or n != LOGIN_REAL]
    for nome, fn in escolhidas:
        inicio = time.monotonic()
        try:
            detalhe, ok = fn(cfg, estado), True
        except Falha as e:
            detalhe, ok = str(e), False
        except Exception as e:  # noqa: BLE001 — sonda nunca pode morrer calada
            detalhe, ok = f"erro inesperado: {type(e).__name__}: {e}", False
        resultados.append({
            "verificacao": nome,
            "ok": ok,
            "detalhe": detalhe,
            "ms": int((time.monotonic() - inicio) * 1000),
        })

    return {
        "quando": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "ok": all(r["ok"] for r in resultados),
        "falhas": [r["verificacao"] for r in resultados if not r["ok"]],
        "resultados": resultados,
        "login_medido": incluir_login,
    }


def main() -> int:
    r = rodar(incluir_login="--sem-login" not in sys.argv)
    if "--json" in sys.argv:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for item in r["resultados"]:
            selo = "ok  " if item["ok"] else "FALHA"
            print(f"{selo} {item['verificacao']:<18} {item['ms']:>5}ms  {item['detalhe']}")
        print("\n" + ("tudo ok" if r["ok"] else "FALHOU: " + ", ".join(r["falhas"])))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
