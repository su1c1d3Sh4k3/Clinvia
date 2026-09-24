"""Nenhuma edge function pode declarar CORS sem `x-origin`.

Em 24/09/2026 o front passou a declarar a origem num header custom
(`x-origin: front`, commit ae7773d). Header custom obriga o navegador a fazer
preflight, e o preflight so passa se o valor estiver listado no
Access-Control-Allow-Headers da RESPOSTA. Nenhuma das 132 functions listava.
Resultado: o navegador recusava a chamada ANTES de ela sair — inclusive a
`verify-turnstile`, que e a primeira coisa que o login faz. Login caiu para
todo mundo, cliente e super admin, com o backend 100% sao.

O erro nao aparece em `curl`: curl nao faz preflight. So aparece no navegador.

Este guarda impede que uma function nova reintroduza a falha.

Uso: python supabase/tests/security/item_cors_x_origin/check.py
Saida 0 = ok. Saida 1 = ha function sem `x-origin`.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3] / "functions"
LINHA = re.compile(r"['\"]Access-Control-Allow-Headers['\"]\s*:\s*['\"]([^'\"]*)['\"]")

# Nao e publicado: molde de referencia e function desativada aguardando decisao.
IGNORAR = {"_webhook-template", "evolution-webhook.disabled"}

faltando = []
conferidos = 0

for arquivo in sorted(RAIZ.rglob("*.ts")):
    partes = arquivo.relative_to(RAIZ).parts
    if partes[0] in IGNORAR:
        continue
    texto = arquivo.read_text(encoding="utf-8")
    for valor in LINHA.findall(texto):
        conferidos += 1
        if "x-origin" not in valor:
            faltando.append(f"{arquivo.relative_to(RAIZ)}: {valor}")

for f in faltando:
    print("SEM x-origin ->", f)

print(f"\n{conferidos} declaracoes de CORS conferidas, {len(faltando)} sem x-origin")
sys.exit(1 if faltando else 0)
