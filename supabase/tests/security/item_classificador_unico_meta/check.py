"""Catraca: erro de envio da Meta passa SEMPRE pelo classificador unico.

A ordem, textual: "um erro de envio da Meta, sincrono ou assincrono, sempre
passa pelo classificador unico; qualquer caminho que abra incidente fora dele
reprova."

Por que isto precisa de barreira e nao so de conserto:

A Meta recusa um envio por dois caminhos fisicamente diferentes. No SINCRONO a
resposta da Graph ja vem com `error.code` e quem descobre e a function de envio.
No ASSINCRONO a Graph responde 200 com wamid de verdade e a recusa chega minutos
depois, num recibo de status -- foi assim que 302 envios morreram com o painel
verde. Sao dois arquivos distintos, escritos em meses distintos, e a tentacao
natural em cada um deles e decidir ali mesmo se aquele codigo merece alerta.

Duas tabelas de codigo divergem em silencio. O sintoma nao e erro: e a mesma
recusa virando alerta por um caminho e ficando muda pelo outro, dependendo de a
Meta ter respondido em 200ms ou em 4 minutos. Por isso `_shared/meta-error-
codes.ts` e o unico lugar onde um codigo da Meta vira `passageiro | bloqueio |
defeito | conta | desconhecido`, e por isso o nome do componente e derivado
desse grupo em vez de escrito a mao.

O que reprova aqui:

  1. arquivo que monta um componente `envio:...` sem importar o classificador --
     e uma segunda tabela de decisao nascendo;
  2. `meta-send-message` devolvendo 5xx na recusa de negocio da Meta. O
     `serveMonitored` relata >= 500: responder 502 para janela de 24h fechada
     abriria um incidente generico por mensagem, com o componente da FUNCTION em
     vez do da Meta -- ruido que ainda por cima aponta para o lugar errado. A
     resposta certa e 200 com `success:false` e o codigo no corpo;
  3. `evolution-send-message` (o repassador) deixando de carimbar
     `x-incident-reported` no repasse de `meta_api_error`. Sem o carimbo, o erro
     ja classificado seria relatado uma SEGUNDA vez pelo repassador, agora
     atribuido a ele.

Uso:
    python supabase/tests/security/item_classificador_unico_meta/check.py

Nao usa rede nem credencial: le somente o repositorio.
Sai 1 se algum caminho escapar do classificador.
"""

from __future__ import annotations

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[4]
FUNCS = RAIZ / "supabase" / "functions"

CLASSIFICADOR = "_shared/meta-error-codes.ts"
# `envio:` seguido de algo que nao seja o grupo interpolado -- o nome escrito a
# mao e exatamente o que nao pode existir fora do classificador.
COMPONENTE = re.compile(r"component:\s*[`\"']envio:")
IMPORTA = re.compile(r"from\s+[\"'][^\"']*meta-error-codes\.ts[\"']")


def arquivos() -> list[pathlib.Path]:
    return sorted(p for p in FUNCS.rglob("index.ts") if p.is_file())


def main() -> int:
    falhas: list[str] = []
    usam: list[str] = []

    for caminho in arquivos():
        texto = caminho.read_text(encoding="utf-8", errors="replace")
        if not COMPONENTE.search(texto):
            continue
        slug = caminho.parent.name
        usam.append(slug)
        if not IMPORTA.search(texto):
            falhas.append(
                f"{slug}: abre incidente `envio:` sem importar {CLASSIFICADOR}"
                " -- segunda tabela de codigos nascendo"
            )

    # 2. a recusa de negocio da Meta responde 200, nao 5xx
    envio = FUNCS / "meta-send-message" / "index.ts"
    texto = envio.read_text(encoding="utf-8", errors="replace")
    trecho = texto[texto.find('error: "meta_api_error"'):] if 'error: "meta_api_error"' in texto else ""
    if not trecho:
        falhas.append("meta-send-message: nao devolve mais `meta_api_error` no corpo")
    elif "status: 200" not in trecho[:1200]:
        falhas.append(
            "meta-send-message: recusa de negocio da Meta nao responde 200"
            " -- o serveMonitored relata >= 500 e abre incidente generico por mensagem"
        )

    # 3. o repassador carimba que o erro JA foi classificado
    repasse = FUNCS / "evolution-send-message" / "index.ts"
    texto = repasse.read_text(encoding="utf-8", errors="replace")
    if "meta_api_error" not in texto or "HEADER_JA_REPORTADO" not in texto:
        falhas.append(
            "evolution-send-message: nao carimba x-incident-reported no repasse"
            " de meta_api_error -- o mesmo erro seria relatado de novo, como defeito dele"
        )

    print(f"caminhos que abrem incidente de envio da Meta: {len(usam)} ({', '.join(usam) or 'nenhum'})")

    if falhas:
        print("\nCAMINHO FORA DO CLASSIFICADOR UNICO:")
        for f in falhas:
            print(f"  CONFERIR  {f}")
        return 1

    print("ok: todo erro de envio da Meta, sincrono e assincrono, passa por meta-error-codes.ts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
