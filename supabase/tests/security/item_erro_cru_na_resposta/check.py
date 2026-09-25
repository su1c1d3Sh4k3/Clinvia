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
        internalDetails: String((error as Error)?.message ?? error),
    })
`internalDetails` leva o motivo real para o log e para o incidente e NAO entra no
corpo. O `report: true` e obrigatorio junto: o `serveMonitored` monta a mensagem
do incidente lendo o CORPO da resposta 5xx, entao limpar o corpo sem reportar
trocaria vazamento por cegueira.

Uso:
    python supabase/tests/security/item_erro_cru_na_resposta/check.py
    python supabase/tests/security/item_erro_cru_na_resposta/check.py --gravar

Nao usa rede nem credencial: le somente o repositorio.
Sai 1 quando a divida diverge da linha de base.
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


def medir() -> dict[str, int]:
    atual: dict[str, int] = {}
    for arq in sorted(FUNCS.rglob("*.ts")):
        rel = arq.relative_to(FUNCS).as_posix()
        n = len(PADRAO.findall(arq.read_text(encoding="utf-8", errors="replace")))
        if n:
            atual[rel] = n
    return atual


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

    if novos:
        print("\nPONTO NOVO (ou a mais) -- use `internalDetails`, veja o cabecalho deste arquivo:")
        for rel, n in sorted(novos.items()):
            print(f"  CONFERIR  {rel}  {base.get(rel, 0)} -> {n}  [{rotulo(rel)}]")

    if consertados:
        print("\nPONTO CONSERTADO e nao registrado -- rode com `--gravar` para baixar a linha de base:")
        for rel, n in sorted(consertados.items()):
            print(f"  CONFERIR  {rel}  {n} -> {atual.get(rel, 0)}")

    if novos or consertados:
        return 1

    print("\nok: nenhum ponto novo alem da linha de base registrada")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
