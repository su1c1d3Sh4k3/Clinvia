"""Texto cru de erro interno saindo no CORPO da resposta de uma edge function.

O ponto:

    } catch (error) {
        return json({ success: false, error: (error as Error).message }, 500);
    }

Essa linha manda para quem chamou a mensagem do Postgres, do Auth ou do provedor
-- com nome de tabela, de coluna e de policy dentro. Nas funcoes `verify_jwt =
false` quem chama pode ser qualquer um que saiba a URL.

Nao e defeito de descuido, e defeito de PREMISSA: `_shared/api-errors.ts` foi
escrito para as `api-*`, cujo unico chamador e o n8n. La `details` com o texto do
banco e o que faz a API ser diagnosticavel. A premissa deixa de valer assim que a
mesma forma e copiada para uma function anonima ou chamada pela tela do cliente.

Consertar os 80 pontos de uma vez seria mutirao, e mutirao nao impede o proximo.
Esta barreira e uma CATRACA: a divida esta contada em `divida.json`, um ponto novo
reprova, e um ponto consertado tambem reprova enquanto a linha de base nao for
baixada -- e o que impede o numero de voltar a crescer em silencio.

Como consertar um ponto (modelo: `request-password-reset`):
    apiError(headers, {
        status: 500, code: "<codigo_estavel>", request: req, report: true,
        message: "<frase segura para quem chamou>",
        details: String((error as Error)?.message ?? error),
    })
`details` leva o motivo real para o log e para o incidente, e so entra no CORPO
se a function tiver chamado `detalheTecnicoNoCorpo()` -- que e coisa de `api-*`
do n8n. O `report: true` e obrigatorio junto nos ramos 5xx: o `serveMonitored`
monta a mensagem do incidente lendo o CORPO da resposta, entao limpar o corpo
sem reportar trocaria vazamento por cegueira.

## Segunda medicao: quem declarou `detalheTecnicoNoCorpo()`

A declaracao e o que devolve o detalhe tecnico ao corpo. Ela tem dois modos de
dar errado, e os dois reprovam aqui:

  - `api-*` do n8n SEM declarar: o corpo sai limpo e a integracao perde o
    diagnostico sem ninguem perceber -- e assim que um conserto de seguranca
    vira apagao de suporte;
  - function que NAO e `api-*` declarando: e o vazamento de volta, agora por
    escrito.

`api-public-booking` e o sandbox dela ficam de fora de proposito: quem le a
resposta e um PACIENTE.

Uso:
    python supabase/tests/security/item_erro_cru_na_resposta/check.py
    python supabase/tests/security/item_erro_cru_na_resposta/check.py --gravar

Nao usa rede nem credencial: le somente o repositorio.
Sai 1 quando a divida diverge da linha de base ou uma declaracao esta errada.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parents[3]
FUNCS = RAIZ / "supabase" / "functions"
CONFIG = RAIZ / "supabase" / "config.toml"
SRC = RAIZ / "src"
DIVIDA = AQUI / "divida.json"

# `error:`/`message:` recebendo a mensagem da excecao direto, dentro de um objeto
# que vira corpo de resposta. Deliberadamente estreito: procurar "message" solto
# acusaria log, template de e-mail e comparacao de string -- barreira que grita
# lobo e barreira que alguem desliga.
PADRAO = re.compile(r"(error|message)\s*:\s*\(?\s*(error|err|e)\s*(as Error)?\s*\)?\??\.message")


def anonimas() -> set[str]:
    """Slugs com `verify_jwt = false` no config.toml."""
    fora = set()
    atual = None
    for linha in CONFIG.read_text(encoding="utf-8", errors="replace").splitlines():
        cab = re.match(r"\[functions\.([^\]]+)\]", linha.strip())
        if cab:
            atual = cab.group(1)
            continue
        if atual and linha.strip().startswith("verify_jwt"):
            if "false" in linha:
                fora.add(atual)
            atual = None
    return fora


def chamadas_pelo_front() -> set[str]:
    achados = set()
    for arq in SRC.rglob("*.ts*"):
        texto = arq.read_text(encoding="utf-8", errors="replace")
        achados.update(re.findall(r"""functions\.invoke\(\s*["']([a-z0-9\-]+)["']""", texto))
    return achados


def sem_logs(texto: str) -> str:
    """Apaga os argumentos das chamadas `console.*(...)`.

    O log e justamente onde o motivo cru DEVE estar. Contar `console.error({
    message: error?.message })` como vazamento fazia a barreira acusar a unica
    linha que esta certa -- e barreira que grita lobo e barreira que alguem
    desliga. Foi o caso de `evolution-send-message`.
    """
    saida: list[str] = []
    i = 0
    while True:
        m = re.search(r"console\.\w+\(", texto[i:])
        if not m:
            saida.append(texto[i:])
            return "".join(saida)
        saida.append(texto[i : i + m.start()])
        j, prof = i + m.end(), 1
        while j < len(texto) and prof:
            prof += (texto[j] == "(") - (texto[j] == ")")
            j += 1
        i = j


def medir() -> dict[str, int]:
    atual: dict[str, int] = {}
    for arq in sorted(FUNCS.rglob("*.ts")):
        rel = arq.relative_to(FUNCS).as_posix()
        n = len(PADRAO.findall(sem_logs(arq.read_text(encoding="utf-8", errors="replace"))))
        if n:
            atual[rel] = n
    return atual


# `api-public-booking` e lida por um PACIENTE: detalhe tecnico no corpo ali e
# vazamento na cara dele, nao diagnostico.
SEM_DECLARACAO = {"api-public-booking", "api-public-booking-sandbox"}


def declaracoes_erradas() -> list[str]:
    erros = []
    for arq in sorted(FUNCS.glob("*/index.ts")):
        slug = arq.parent.name
        texto = arq.read_text(encoding="utf-8", errors="replace")
        # A chamada de verdade, no topo do modulo -- nao a mencao dentro de um
        # comentario explicando por que aquela function NAO declara.
        declara = re.search(r"^detalheTecnicoNoCorpo\(\);", texto, re.M) is not None
        deveria = slug.startswith("api-") and slug not in SEM_DECLARACAO and "_shared/api-errors.ts" in texto
        if deveria and not declara:
            erros.append(f"{slug}: API do n8n SEM `detalheTecnicoNoCorpo()` -- o n8n perde o motivo do erro")
        if declara and not deveria:
            erros.append(f"{slug}: declarou `detalheTecnicoNoCorpo()` sem ser API do n8n -- volta a vazar")
    return erros


def main(argv: list[str]) -> int:
    atual = medir()

    if "--gravar" in argv:
        DIVIDA.write_text(json.dumps(atual, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"linha de base gravada: {len(atual)} arquivo(s), {sum(atual.values())} ponto(s)")
        return 0

    base: dict[str, int] = json.loads(DIVIDA.read_text(encoding="utf-8")) if DIVIDA.exists() else {}

    novos = {k: v for k, v in atual.items() if v > base.get(k, 0)}
    consertados = {k: base[k] for k in base if base[k] > atual.get(k, 0)}

    anon = anonimas()
    front = chamadas_pelo_front()

    def rotulo(rel: str) -> str:
        slug = rel.split("/")[0]
        if slug in anon and slug in front:
            return "ANONIMA+FRONT"
        if slug in anon:
            return "ANONIMA"
        if slug in front:
            return "front (logado)"
        return "interna"

    print(f"divida: {len(atual)} arquivo(s), {sum(atual.values())} ponto(s)")
    expostos = sorted(k for k in atual if rotulo(k) == "ANONIMA+FRONT")
    print(f"  dos quais {len(expostos)} em function ANONIMA que o front chama (estranho le o texto cru)")

    declara = declaracoes_erradas()

    if novos:
        print("\nPONTO NOVO (ou a mais) -- use `details`, veja o cabecalho deste arquivo:")
        for rel, n in sorted(novos.items()):
            print(f"  CONFERIR  {rel}  {base.get(rel, 0)} -> {n}  [{rotulo(rel)}]")

    if consertados:
        print("\nPONTO CONSERTADO e nao registrado -- rode com `--gravar` para baixar a linha de base:")
        for rel, n in sorted(consertados.items()):
            print(f"  CONFERIR  {rel}  {n} -> {atual.get(rel, 0)}")

    if declara:
        print("\nDECLARACAO de detalhe tecnico no corpo fora do lugar:")
        for e in declara:
            print(f"  CONFERIR  {e}")

    if novos or consertados or declara:
        return 1

    print("\nok: nenhum ponto novo alem da linha de base, e as declaracoes conferem")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
