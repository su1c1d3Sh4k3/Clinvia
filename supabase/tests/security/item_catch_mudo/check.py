"""Catch que engole o erro dentro de edge function.

Duas classes, com pesos diferentes de proposito:

  MUDO  -- `catch { }` vazio, `catch { /* comentario */ }` e `.catch(() => {})`.
           Nao sobra NADA: nem linha no armazem de logs, nem incidente. O erro
           deixou de existir. **Tolerancia zero: qualquer ponto reprova.**

  SO-LOG -- o catch tem `console.*` e mais nada. Deixa rastro consultavel
           (`analytics/endpoints/logs`, retencao >= 90 dias), mas nao acorda
           ninguem: e forense, nao monitoramento. E divida contada, em catraca:
           ponto novo reprova, e ponto consertado tambem reprova enquanto a
           linha de base nao for baixada com `--gravar`.

A separacao nao e indulgencia, e medicao: das duas, so a primeira apaga a prova.
Tratar as duas como a mesma coisa faria a barreira acusar ~100 pontos no primeiro
dia, e barreira que grita lobo e barreira que alguem desliga.

Como consertar um ponto:

    } catch (erro) {
        reportIncident({
            component: "<familia>:<o-que-quebrou>",
            route: "<acao>",
            message: "<frase ESTAVEL -- o detalhe variavel entra no contexto>",
            context: { detalhe: String((erro as Error)?.message ?? erro) },
        });
    }

Mensagem estavel porque ela entra no fingerprint: pendurar nela o texto do
Postgres cria um incidente novo por variacao. O componente precisa de linha em
`public.incident_component_catalog` (descricao, acao padrao, severidade), senao
o piso implicito e `media` e a IA vira a unica autora da gravidade.

Dispensa nominal, uma linha DENTRO do catch:

    // catch-mudo: <motivo>

Use so quando o silencio for a decisao certa -- o caso legitimo e o proprio
reporter de incidente, que nao pode reportar a propria falha sem recursao.

Uso:
    python supabase/tests/security/item_catch_mudo/check.py
    python supabase/tests/security/item_catch_mudo/check.py --gravar

Nao usa rede nem credencial: le somente o repositorio.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parents[3]
FUNCS = RAIZ / "supabase" / "functions"
DIVIDA = AQUI / "divida.json"

# Nunca foram publicadas: molde e resto desativado.
FORA = {"_webhook-template", "evolution-webhook.disabled"}

DISPENSA = re.compile(r"//\s*catch-mudo:")
RE_CATCH = re.compile(r"\bcatch\s*(?:\([^)]*\)\s*)?\{")
RE_CATCH_SETA = re.compile(r"\.catch\s*\(\s*(?:\([^)]*\)|\w+)\s*=>\s*\{")


def apagar_comentarios(texto: str) -> str:
    """Troca comentario por espaco, preservando as quebras de linha.

    Sem isto a barreira acusa o proprio comentario que EXPLICA um conserto:
    `api-scheduling` documenta no cabecalho o `.catch(() => {})` que deixou de
    existir, e a medicao contava a documentacao como defeito.
    """
    saida = list(texto)
    i, n = 0, len(texto)
    while i < n:
        c = texto[i]
        if c in "\"'`":
            i += 1
            while i < n and texto[i] != c:
                i += 2 if texto[i] == "\\" else 1
            i += 1
        elif texto.startswith("//", i):
            while i < n and texto[i] != "\n":
                saida[i] = " "
                i += 1
        elif texto.startswith("/*", i):
            fim = texto.find("*/", i + 2)
            fim = n if fim < 0 else fim + 2
            for j in range(i, fim):
                if saida[j] != "\n":
                    saida[j] = " "
            i = fim
        else:
            i += 1
    return "".join(saida)


def bloco(texto: str, abre: int) -> tuple[str, int]:
    """Devolve o corpo entre `{` em `abre` e a chave que o fecha."""
    prof, i = 1, abre + 1
    while i < len(texto) and prof:
        c = texto[i]
        if c == "{":
            prof += 1
        elif c == "}":
            prof -= 1
        elif c in "\"'`":
            i += 1
            while i < len(texto) and texto[i] != c:
                i += 2 if texto[i] == "\\" else 1
        i += 1
    return texto[abre + 1 : i - 1], i


def sem_comentarios(corpo: str) -> str:
    corpo = re.sub(r"/\*.*?\*/", "", corpo, flags=re.S)
    corpo = re.sub(r"^\s*//.*$", "", corpo, flags=re.M)
    return corpo.strip()


def sem_console(corpo: str) -> str:
    """Apaga as chamadas `console.*(...)` inteiras, argumentos incluidos."""
    saida, i = [], 0
    while True:
        m = re.search(r"console\.\w+\(", corpo[i:])
        if not m:
            saida.append(corpo[i:])
            return "".join(saida).strip()
        saida.append(corpo[i : i + m.start()])
        j, prof = i + m.end(), 1
        while j < len(corpo) and prof:
            prof += (corpo[j] == "(") - (corpo[j] == ")")
            j += 1
        while j < len(corpo) and corpo[j] in " ;\n\r\t":
            j += 1
        i = j


def linha_de(texto: str, pos: int) -> int:
    return texto.count("\n", 0, pos) + 1


def medir() -> tuple[list[str], dict[str, int]]:
    mudos: dict[tuple[str, int], str] = {}
    so_log: dict[str, int] = {}

    for arq in sorted(FUNCS.rglob("*.ts")):
        rel = arq.relative_to(FUNCS).as_posix()
        if rel.split("/")[0] in FORA:
            continue
        bruto = arq.read_text(encoding="utf-8", errors="replace")
        # Comentario vira espaco do MESMO tamanho: as posicoes continuam valendo
        # no texto original, que e onde a dispensa e procurada.
        limpo = apagar_comentarios(bruto)

        pontos: list[int] = []
        for regex in (RE_CATCH, RE_CATCH_SETA):
            for m in regex.finditer(limpo):
                pontos.append(m.end() - 1)

        for abre in sorted(pontos):
            corpo, fim = bloco(limpo, abre)
            # A dispensa vale dentro do bloco OU no comentario imediatamente
            # antes dele: o motivo costuma ser mais longo que o catch e fica
            # melhor em cima.
            if DISPENSA.search(bruto[max(0, abre - 400) : fim]):
                continue
            util = corpo.strip()
            if not util:
                ln = linha_de(bruto, abre)
                mudos[(rel, ln)] = f"{rel}:{ln}  catch sem nada (vazio ou so comentario)"
            elif not sem_console(util):
                so_log[rel] = so_log.get(rel, 0) + 1

        # `.catch(() => {})` numa linha so: a seta sem chaves nao cai no regex
        # acima, e e a forma mais comum do fire-and-forget mudo.
        for m in re.finditer(r"\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)", limpo):
            if DISPENSA.search(bruto[max(0, m.start() - 400) : m.end() + 160]):
                continue
            ln = linha_de(bruto, m.start())
            mudos[(rel, ln)] = f"{rel}:{ln}  .catch(() => {{}})"

    return [mudos[k] for k in sorted(mudos)], so_log


def main(argv: list[str]) -> int:
    mudos, so_log = medir()

    if "--gravar" in argv:
        DIVIDA.write_text(json.dumps(so_log, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"linha de base so-log gravada: {len(so_log)} arquivo(s), {sum(so_log.values())} ponto(s)")
        return 0

    base: dict[str, int] = json.loads(DIVIDA.read_text(encoding="utf-8")) if DIVIDA.exists() else {}
    novos = {k: v for k, v in so_log.items() if v > base.get(k, 0)}
    consertados = {k: base[k] for k in base if base[k] > so_log.get(k, 0)}

    print(f"catch MUDO (tolerancia zero): {len(mudos)}")
    print(f"catch so com console.*: {sum(so_log.values())} ponto(s) em {len(so_log)} arquivo(s)")

    if mudos:
        print("\nCATCH MUDO -- nao sobra nem log; reporte ou dispense com `// catch-mudo: <motivo>`:")
        for m in mudos:
            print(f"  CONFERIR  {m}")

    if novos:
        print("\nPONTO NOVO so-log -- catch novo que so registra no console:")
        for rel, n in sorted(novos.items()):
            print(f"  CONFERIR  {rel}  {base.get(rel, 0)} -> {n}")

    if consertados:
        print("\nPONTO CONSERTADO e nao registrado -- rode com `--gravar`:")
        for rel, n in sorted(consertados.items()):
            print(f"  CONFERIR  {rel}  {n} -> {so_log.get(rel, 0)}")

    if mudos or novos or consertados:
        return 1

    print("\nok: nenhum catch mudo e nenhum ponto so-log alem da linha de base")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
