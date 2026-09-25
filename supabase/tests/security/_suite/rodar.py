#!/usr/bin/env python3
"""Roda a suite inteira de testes de acesso (`supabase/tests/security/*/verify.sql`).

Motivo: ate hoje cada verify.sql so rodava no dia em que nascia. Isso ja custou
caro duas vezes — uma migration nova reemitiu uma funcao inteira e apagou, em
silencio, guarda posta por migration anterior. O teste da correcao antiga existia
e nao rodou.

Uso:
    python supabase/tests/security/_suite/rodar.py            # suite inteira
    python supabase/tests/security/_suite/rodar.py cron alert # so pastas que casam

O que ele NAO faz, de proposito:
  - nao roda os dois verify que ESCREVEM em producao (lista BLOQUEADOS abaixo);
  - nao inventa veredito para os arquivos que so despejam medicao em texto livre.
    Eles rodam, aparecem como 'sem veredito' e o numero de linhas fica no relatorio;
    se um deles passar a importar, o conserto e dar coluna `status` a ele, nao
    adivinhar aqui.

Saida: 0 se nenhum `CONFERIR`; 1 se algum verify reprovou ou quebrou.
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

TESTES = pathlib.Path(__file__).resolve().parents[1]        # supabase/tests/security
RAIZ = TESTES.parents[2]                                    # .../Clinvia
# PARALELO fica em 1 por MEDICAO, nao por cautela: cada `supabase db query` cria
# o papel temporario `cli_login_postgres` com senha nova. Duas chamadas ao mesmo
# tempo e a segunda troca a senha debaixo da primeira, que morre com
# 28P01 (password authentication failed). A CLI nao e concorrente por construcao.
# Sair disso exige SUPABASE_DB_PASSWORD e conexao direta — ai a suite inteira
# cabe numa sessao so e leva segundos em vez de minutos.
PARALELO = 1

# `npx supabase` sem versao busca a ULTIMA a cada chamada — entao um release
# quebrado da CLI derruba a suite inteira no meio da execucao, e o erro vem
# disfarcado de reprovacao em massa ("QUEBROU" em 41 de 45, todas com a mesma
# linha do supabase.js). Foi o que a 2.118.0 fez em 25/09/2026: o pacote de
# binario `@supabase/cli-windows-x64@2.118.0` nunca foi publicado, entao no
# Windows a CLI morre com "No matching Supabase CLI binary package found".
# Versao fixa aqui: quem quiser testar uma nova passa SUPABASE_CLI_VERSAO.
CLI = "supabase@" + os.environ.get("SUPABASE_CLI_VERSAO", "2.117.0")

# Escrevem em tabela real (injetam evento de teste, mexem em llm_platform_settings).
# Ficam fora da suite automatica e sao rodados a mao quando o item deles muda.
BLOQUEADOS = {"item_entrada_invalida", "item_silencio_sql"}

# Medem uma janela de minutos depois de um disparo manual (curls do README): a
# frio a janela esta vazia e eles reprovam SEMPRE. Deixar na suite automatica
# seria ensinar a ignorar vermelho, que e o oposto do que ela serve.
PRECISA_DISPARO = {"item_etapa2_teste_inverso"}

# O veredito tem que ser a CELULA (ou o comeco dela, por causa dos format('%-6s ...')),
# nunca uma palavra solta no meio de texto livre: varios verify escrevem
# "ANON | le a coluna | FALHOU 42501" para dizer que o bloqueio FUNCIONOU. Procurar
# a palavra em qualquer lugar transforma acerto em alarme, e suite que grita lobo
# toda vez e suite que ninguem roda.
REPROVA = re.compile(r"^\s*(CONFERIR|FALHOU|FALHA)\b", re.I)
APROVA = re.compile(r"^\s*(ok|medicao)\b", re.I)


def limpo(txt: str) -> str:
    linhas = []
    for linha in txt.splitlines():
        corte = linha.find("--")
        linhas.append(linha[:corte] if corte >= 0 else linha)
    return "\n".join(linhas).strip()


def componivel(corpo: str) -> bool:
    """1 statement puro `with`/`select` => cabe dentro de um union com os outros."""
    if re.search(r"\b(do\s*\$|set\s+(local\s+)?role|create\s+temp|begin\s*;)", corpo, re.I):
        return False
    sem_final = corpo.rstrip().rstrip(";")
    if ";" in sem_final:
        return False
    return bool(re.match(r"^\s*(with|select)\b", sem_final, re.I))


def sql_cli(caminho: pathlib.Path) -> tuple[int, str, str]:
    """Devolve (codigo, stdout, stderr) SEPARADOS: a CLI escreve o JSON no stdout
    e o progresso ('Initialising login role...') no stderr. Concatenar os dois
    suja o JSON e faz TODO verify parecer quebrado."""
    r = subprocess.run(
        ["npx", "-y", CLI, "db", "query", "--linked", "--file", str(caminho)],
        cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace",
        shell=(sys.platform == "win32"),
    )
    return r.returncode, (r.stdout or ""), (r.stderr or "")


def linhas_do_json(saida: str) -> list[dict] | None:
    i = saida.find("{")
    if i < 0:
        return None
    try:
        # raw_decode e nao loads: a CLI as vezes emite ruido depois do objeto.
        obj, _ = json.JSONDecoder().raw_decode(saida[i:])
    except json.JSONDecodeError:
        return None
    return obj.get("rows") if isinstance(obj, dict) else None


class Resultado:
    def __init__(self, pasta: str) -> None:
        self.pasta = pasta
        self.linhas = 0
        self.conferir: list[str] = []
        self.erro: str | None = None
        self.tem_veredito = False

    @property
    def rotulo(self) -> str:
        if self.erro:
            return "QUEBROU"
        if self.conferir:
            return "CONFERIR"
        if not self.tem_veredito:
            return "sem veredito"
        return "ok"


def avaliar(pasta: str, _fonte: str, linhas: list[dict]) -> Resultado:
    """Dois formatos de veredito convivem na suite: coluna booleana e celula de
    texto comecando em ok/CONFERIR/FALHOU. Quem nao tem nenhum dos dois nao e
    julgado aqui — sai como 'sem veredito' e quem julga e um humano lendo."""
    res = Resultado(pasta)
    res.linhas = len(linhas)
    for linha in linhas:
        celulas = list(linha.values())
        texto = " | ".join(f"{v}" for v in celulas)
        bools = [v for v in celulas if isinstance(v, bool)]
        marcas = [v for v in celulas if isinstance(v, str) and (REPROVA.match(v) or APROVA.match(v))]
        if not bools and not marcas:
            continue
        res.tem_veredito = True
        if False in bools or any(REPROVA.match(v) for v in marcas):
            res.conferir.append(texto[:160])
    return res


def rodar_avulso(arq: pathlib.Path) -> Resultado:
    codigo, saida, erro = sql_cli(arq)
    linhas = linhas_do_json(saida)
    if linhas is None:
        res = Resultado(arq.parent.name)
        res.erro = motivo_da_falha(saida, erro)
        return res
    return avaliar(arq.parent.name, arq.read_text(encoding="utf-8", errors="replace"), linhas)


def rodar_composto(arqs: list[pathlib.Path]) -> list[Resultado]:
    """Junta N verify de 1 statement em UMA chamada: cada um vira subconsulta e as
    colunas viram json, que e a unica forma de unir formatos diferentes."""
    partes = []
    for arq in arqs:
        corpo = limpo(arq.read_text(encoding="utf-8", errors="replace")).rstrip().rstrip(";")
        partes.append(
            f"select {escapar(arq.parent.name)} as pasta, row_to_json(q)::text as linha "
            f"from (\n{corpo}\n) q"
        )
    sql = "\nunion all\n".join(partes) + ";\n"

    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False,
                                     dir=TESTES / "_suite", encoding="utf-8") as fh:
        fh.write(sql)
        tmp = pathlib.Path(fh.name)
    try:
        codigo, saida, erro = sql_cli(tmp)
        linhas = linhas_do_json(saida)
    finally:
        tmp.unlink(missing_ok=True)

    if linhas is None:
        # A chamada unica quebrou: cai para individual, senao 28 itens somem juntos.
        print(f"  ! bloco unico falhou ({motivo_da_falha(saida, erro)}), "
              f"rodando um a um", flush=True)
        return [rodar_avulso(a) for a in arqs]

    por_pasta: dict[str, list[dict]] = {a.parent.name: [] for a in arqs}
    for linha in linhas:
        por_pasta.setdefault(linha["pasta"], []).append(json.loads(linha["linha"]))
    return [
        avaliar(a.parent.name, a.read_text(encoding="utf-8", errors="replace"),
                por_pasta.get(a.parent.name, []))
        for a in arqs
    ]


def escapar(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def motivo_da_falha(saida: str, erro: str) -> str:
    """O erro do Postgres vem no stderr, misturado com o progresso da CLI. Pegar
    a ultima linha as cegas devolve 'Initialising login role...' e esconde o
    42703 que e o que interessa."""
    linhas = [l.strip() for l in (erro + "\n" + saida).splitlines() if l.strip()]
    uteis = [l for l in linhas if not l.startswith("Initialising")]
    return (uteis or linhas or ["sem saida"])[0][:300]


def main(argv: list[str]) -> int:
    filtros = [a.lower() for a in argv[1:]]
    arqs, pulados, sem_disparo = [], [], []
    for arq in sorted(TESTES.glob("*/verify.sql")):
        nome = arq.parent.name
        if nome in BLOQUEADOS:
            pulados.append(nome)
            continue
        if nome in PRECISA_DISPARO and not filtros:
            sem_disparo.append(nome)
            continue
        if filtros and not any(f in nome.lower() for f in filtros):
            continue
        arqs.append(arq)

    if not arqs:
        print("nenhum verify.sql casou com o filtro")
        return 0

    comp = [a for a in arqs if componivel(limpo(a.read_text(encoding="utf-8", errors="replace")))]
    avulsos = [a for a in arqs if a not in comp]

    print(f"suite de acesso: {len(arqs)} verify "
          f"({len(comp)} num bloco unico, {len(avulsos)} avulsos, "
          f"{len(pulados)} fora por escreverem em producao)")
    t0 = time.time()

    resultados: list[Resultado] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=PARALELO) as pool:
        futuros = [pool.submit(rodar_avulso, a) for a in avulsos]
        if comp:
            futuro_bloco = pool.submit(rodar_composto, comp)
            resultados.extend(futuro_bloco.result())
        for f in futuros:
            resultados.append(f.result())

    resultados.sort(key=lambda r: r.pasta)
    ruins = [r for r in resultados if r.rotulo in ("CONFERIR", "QUEBROU")]
    mudos = [r for r in resultados if r.rotulo == "sem veredito"]

    for r in resultados:
        print(f"  {r.rotulo:<13} {r.pasta}  ({r.linhas} linha(s))")
        for c in r.conferir[:6]:
            print(f"        -> {c}")
        if r.erro:
            print(f"        -> {r.erro}")

    print(f"\n{len(resultados) - len(ruins)}/{len(resultados)} sem reprovacao "
          f"em {time.time() - t0:.0f}s")
    if mudos:
        print(f"{len(mudos)} verify nao tem coluna de veredito — rodam, mas quem julga "
              f"e um humano lendo. Dar `status ok|CONFERIR` a eles e divida aberta.")
    if pulados:
        print(f"fora da suite (escrevem em producao): {', '.join(sorted(pulados))}")
    if sem_disparo:
        print(f"fora da suite (so valem apos disparo manual): {', '.join(sorted(sem_disparo))}")
    return 1 if ruins else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
