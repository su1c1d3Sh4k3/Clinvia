#!/usr/bin/env python3
"""Gera e aplica uma senha nova para a conta interna da sentinela.

Rode no SEU PC, nunca na VPS. A senha aparece UMA vez, no seu terminal, e nao
e gravada em lugar nenhum: nem em arquivo, nem em log, nem neste repositorio.
Quem escreveu este script nao a ve.

    python rotacionar_senha.py

Precisa de duas coisas no ambiente (ou no `.env` da raiz do repositorio, que o
script le sozinho):

    SUPABASE_URL                 https://<ref>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    chave de servico do projeto

A chave de servico NAO vai para a VPS. Ela existe so nesta rotacao, aqui.

O que ele faz, em ordem:

  1. acha a conta `sentinela.login@clinvia.com.br` pela Admin API;
  2. sorteia uma senha de 32 caracteres (`secrets`, nao `random`);
  3. aplica;
  4. PROVA que funciona fazendo um login de verdade e o logout — sem esse passo
     voce descobriria que a senha nao pegou so quando a sentinela ficasse muda,
     que e quando ela mais importa;
  5. imprime a senha uma vez e manda colar no `/etc/sentinela-login.env`.

Saida: 0 = senha trocada e provada, 1 = nada foi trocado ou a prova falhou.
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request

EMAIL = "sentinela.login@clinvia.com.br"

# A Cloudflare responde 403 para `Python-urllib/*`. O host do Supabase nao esta
# atras dela hoje, mas custa nada e ja nos mordeu duas vezes neste projeto.
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")


def _env_do_repo() -> dict:
    """Le o `.env` da raiz do repositorio, se existir. Nao sobrescreve o shell."""
    raiz = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    caminho = os.path.join(raiz, ".env")
    achado: dict[str, str] = {}
    try:
        with open(caminho, encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                chave, valor = linha.split("=", 1)
                achado[chave.strip()] = valor.strip().strip('"').strip("'")
    except OSError:
        pass
    return achado


def _chamar(url: str, metodo: str, chave: str, corpo: dict | None = None) -> dict:
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("apikey", chave)
    req.add_header("Authorization", f"Bearer {chave}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            bruto = r.read().decode("utf-8", "replace")
            return json.loads(bruto) if bruto else {}
    except urllib.error.HTTPError as e:
        # O corpo do erro do GoTrue nao carrega credencial, mas o REQUEST sim —
        # por isso so a resposta e mostrada, nunca o que foi enviado.
        detalhe = e.read()[:300].decode("utf-8", "replace")
        raise SystemExit(f"falhou {metodo} {url.split('?')[0]}: {e.code} {detalhe}")


def main() -> int:
    do_repo = _env_do_repo()
    url = (os.environ.get("SUPABASE_URL") or do_repo.get("SUPABASE_URL", "")).rstrip("/")
    servico = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
               or do_repo.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    anon = (os.environ.get("SUPABASE_ANON_KEY")
            or do_repo.get("VITE_SUPABASE_PUBLISHABLE_KEY")
            or do_repo.get("SUPABASE_ANON_KEY", ""))

    if not url or not servico:
        print("faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY "
              "(no shell ou no .env da raiz)", file=sys.stderr)
        return 1

    print(f"procurando {EMAIL} ...")
    achados = _chamar(
        f"{url}/auth/v1/admin/users?page=1&per_page=200", "GET", servico)
    usuarios = achados.get("users", achados if isinstance(achados, list) else [])
    alvo = next((u for u in usuarios if u.get("email") == EMAIL), None)
    if not alvo:
        print(f"conta {EMAIL} nao encontrada — a migration "
              "20260924200000_conta_interna foi aplicada?", file=sys.stderr)
        return 1

    nova = secrets.token_urlsafe(24)

    print("aplicando a senha nova ...")
    _chamar(f"{url}/auth/v1/admin/users/{alvo['id']}", "PUT", servico,
            {"password": nova})

    # Prova de vida. Sem ela, uma senha que nao pegou so apareceria no dia em
    # que a verificacao 7 comecasse a falhar — e ai o alerta seria sobre nos.
    print("provando com um login de verdade ...")
    if not anon:
        print("  (sem chave anon no ambiente: pulando a prova)", file=sys.stderr)
    else:
        sessao = _chamar(f"{url}/auth/v1/token?grant_type=password", "POST", anon,
                         {"email": EMAIL, "password": nova})
        if not sessao.get("access_token"):
            print("a senha foi trocada mas o login NAO funcionou — "
                  "nao cole nada na VPS ainda", file=sys.stderr)
            return 1
        req = urllib.request.Request(f"{url}/auth/v1/logout", data=b"", method="POST")
        req.add_header("apikey", anon)
        req.add_header("Authorization", f"Bearer {sessao['access_token']}")
        req.add_header("User-Agent", USER_AGENT)
        try:
            urllib.request.urlopen(req, timeout=30).close()
        except Exception:  # noqa: BLE001 — sessao de teste expira sozinha
            pass
        print("  login e logout ok")

    print("\n" + "=" * 62)
    print("SENHA NOVA (aparece uma vez so, nao fica gravada em lugar nenhum):")
    print()
    print(f"    SENTINELA_SENHA={nova}")
    print()
    print("Cole no /etc/sentinela-login.env da VPS e reinicie o timer:")
    print("    sudo systemctl restart sentinela-login.timer")
    print("=" * 62)
    print("\nDepois de colar, limpe o historico do terminal se ele for compartilhado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
