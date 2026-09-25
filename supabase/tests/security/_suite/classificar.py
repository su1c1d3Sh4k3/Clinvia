#!/usr/bin/env python3
"""Classifica cada verify.sql da suite em: leitura pura / transacional / ESCREVE.

Nao roda nada. So le os arquivos e responde a pergunta que importa antes de
montar o executor: da para rodar a suite inteira sem mexer em dado de producao?

Regras da classificacao:
  - 'leitura'      : nenhum DML fora de tabela temporaria.
  - 'transacional' : tem DML, mas o arquivo abre com begin e fecha com rollback
                     (ou so escreve em temp table) => nao deixa rastro.
  - 'ESCREVE'      : tem DML em tabela real sem rollback no fim. Fica FORA da
                     suite automatica.
"""
from __future__ import annotations

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DML = re.compile(
    r"^\s*(insert\s+into|update|delete\s+from|truncate|alter\s+table|"
    r"drop\s+(table|function|policy)|grant|revoke|create\s+(?!temp)"
    r"(or\s+replace\s+)?(table|function|policy|index))",
    re.IGNORECASE,
)
DML_TEMP = re.compile(r"^\s*(insert\s+into|update|delete\s+from)\s+_", re.IGNORECASE)
CREATE_TEMP = re.compile(r"^\s*create\s+temp", re.IGNORECASE)
GRANT_TEMP = re.compile(r"^\s*grant\s+.*\son\s+_\w+\s", re.IGNORECASE)


def sem_comentario(txt: str) -> list[str]:
    linhas = []
    for linha in txt.splitlines():
        corte = linha.find("--")
        linhas.append(linha[:corte] if corte >= 0 else linha)
    return linhas


def classificar(caminho: pathlib.Path) -> tuple[str, list[str]]:
    txt = caminho.read_text(encoding="utf-8", errors="replace")
    linhas = sem_comentario(txt)
    corpo = "\n".join(linhas)

    suspeitas: list[str] = []
    for n, linha in enumerate(linhas, 1):
        if not DML.search(linha):
            continue
        if DML_TEMP.search(linha) or CREATE_TEMP.search(linha) or GRANT_TEMP.search(linha):
            continue
        suspeitas.append(f"{n}: {linha.strip()[:110]}")

    if not suspeitas:
        return "leitura", []

    tem_begin = re.search(r"^\s*begin\s*;", corpo, re.IGNORECASE | re.MULTILINE)
    tem_rollback = re.search(r"^\s*rollback\s*;", corpo, re.IGNORECASE | re.MULTILINE)
    if tem_begin and tem_rollback:
        return "transacional", suspeitas
    return "ESCREVE", suspeitas


def main() -> int:
    arquivos = sorted(RAIZ.glob("*/verify.sql"))
    grupos: dict[str, list[tuple[str, list[str]]]] = {
        "leitura": [],
        "transacional": [],
        "ESCREVE": [],
    }
    for arq in arquivos:
        tipo, suspeitas = classificar(arq)
        grupos[tipo].append((arq.parent.name, suspeitas))

    print(f"verify.sql encontrados: {len(arquivos)}\n")
    for tipo in ("leitura", "transacional", "ESCREVE"):
        itens = grupos[tipo]
        print(f"== {tipo}: {len(itens)} ==")
        for nome, suspeitas in itens:
            print(f"  {nome}")
            if tipo == "ESCREVE":
                for s in suspeitas[:4]:
                    print(f"      {s}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
