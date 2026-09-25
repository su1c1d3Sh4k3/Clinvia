#!/usr/bin/env python3
"""Prova a logica de decisao da sentinela sem tocar na rede.

Por que existe
--------------
A sentinela e a ultima linha, e a unica peca dela que ninguem ve funcionando e
justamente a que decide QUANDO avisar. Se a contagem de confirmacoes estiver
errada, o defeito aparece so no dia do incidente — que e o pior dia possivel
para descobrir que o vigia estava quebrado. Este arquivo troca a sonda, o
WhatsApp e o heartbeat por dubles e roda uma linha do tempo de passadas de 1
minuto.

Roda em qualquer lugar, offline, em menos de um segundo. Depois de instalar na
VPS, rode uma vez antes de confiar no servico:

    python teste_logica.py

Saida: 0 = tudo certo, 1 = a logica de decisao regrediu.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

import aviso
import probe
import sentinela

RELOGIO = [0]
QUEBRADAS: set[str] = set()
ENVIADOS: list[tuple[int, str, str]] = []
BATIDAS: list[tuple[int, dict]] = []
CHAMADAS_LOGIN = [0]


def _sonda_falsa(incluir_login: bool = True) -> dict:
    nomes = [n for n, _ in probe.VERIFICACOES
             if incluir_login or n != probe.LOGIN_REAL]
    if incluir_login:
        CHAMADAS_LOGIN[0] += 1
    return {
        "quando": f"t+{RELOGIO[0]}min",
        "ok": not (QUEBRADAS & set(nomes)),
        "falhas": [n for n in nomes if n in QUEBRADAS],
        "resultados": [{"verificacao": n, "ok": n not in QUEBRADAS,
                        "detalhe": "quebrou" if n in QUEBRADAS else "ok",
                        "ms": 1} for n in nomes],
        "login_medido": incluir_login,
    }


def _preparar() -> str:
    caminho = os.path.join(tempfile.gettempdir(), "sentinela_teste.json")
    if os.path.exists(caminho):
        os.remove(caminho)
    os.environ["SENTINELA_ESTADO"] = caminho
    probe.rodar = _sonda_falsa
    # Os dois caminhos de saida viram dubles. Nenhum toca a rede: o token da
    # Meta e a chave do heartbeat nao existem neste processo, de proposito.
    aviso.config = lambda: {"phone_id": "duble", "token": "duble", "para": ["55"],
                            "url": "duble", "anon": "duble", "hb_key": "duble"}
    aviso.enviar_whatsapp = lambda cfg, alerta: (
        ENVIADOS.append((RELOGIO[0], alerta["severidade"],
                         alerta["oQueAconteceu"])) or True)
    aviso.heartbeat = lambda cfg, corpo: (
        BATIDAS.append((RELOGIO[0], corpo)) or True)
    # Relogio de mentira: cada passada anda 1 minuto.
    sentinela.time = type("relogio", (), {
        "time": staticmethod(lambda: RELOGIO[0] * 60),
    })()
    return caminho


def _passadas(n: int) -> None:
    for _ in range(n):
        RELOGIO[0] += 1
        sys.argv = ["teste"]
        sentinela.main()


def _conferir(nome: str, condicao: bool, visto: object) -> bool:
    print(f"{'ok    ' if condicao else 'FALHOU'} {nome}")
    if not condicao:
        print(f"       visto: {visto}")
    return condicao


def main() -> int:
    caminho = _preparar()
    passou = True
    saida = sys.stdout
    sys.stdout = open(os.devnull, "w")  # a sentinela fala muito; so o teste importa

    try:
        # 1. Saudavel: login real racionado, nenhum aviso de queda, e o
        #    heartbeat saindo assim mesmo — e a passada em que tudo passa que
        #    prova que a caixa esta viva. E isto que aposentou o e-mail diario.
        _passadas(10)
        sys.stdout, calado = saida, sys.stdout
        passou &= _conferir(
            "10 min saudaveis: login real roda 2x, nao 10",
            CHAMADAS_LOGIN[0] == 2, CHAMADAS_LOGIN[0])
        passou &= _conferir(
            "10 min saudaveis: nenhum WhatsApp", ENVIADOS == [], ENVIADOS)
        passou &= _conferir(
            "heartbeat sai em toda passada, inclusive nas saudaveis",
            len(BATIDAS) == 10 and all(b["ok"] for _, b in BATIDAS), BATIDAS)
        sys.stdout = calado

        # 2. Quebra de verificacao de 1 min: avisa na 3a passada, nem antes
        #    nem depois.
        QUEBRADAS.add("preflight")
        _passadas(4)
        sys.stdout, calado = saida, sys.stdout
        passou &= _conferir(
            "preflight quebrado avisa na 3a passada",
            ENVIADOS == [(13, sentinela.SEV_CRITICO, "preflight: quebrou")],
            ENVIADOS)
        # O painel ve o tropeco que o WhatsApp ainda nao viu: na passada 11 ja
        # ha falha crua no heartbeat, e nenhuma confirmada.
        passou &= _conferir(
            "heartbeat leva a medicao crua, sem esperar confirmacao",
            BATIDAS[10][1]["falhas"] == ["preflight"]
            and BATIDAS[10][1]["confirmadas"] == [], BATIDAS[10])
        sys.stdout = calado

        # 3. Quebra do login: com o racionamento suspenso, confirma em 3 min e
        #    nao em 15. A assinatura CRESCEU, entao o aviso nao espera o
        #    lembrete de 30 min.
        ENVIADOS.clear()
        QUEBRADAS.add("login_real")
        _passadas(6)
        sys.stdout, calado = saida, sys.stdout
        passou &= _conferir(
            "login quebrado confirma em 3 min (racionamento suspenso)",
            ENVIADOS == [(17, sentinela.SEV_CRITICO,
                          "login_real: quebrou; preflight: quebrou")],
            ENVIADOS)
        sys.stdout = calado

        # 4. Recuperacao PARCIAL nao e noticia: o conjunto encolheu, ninguem
        #    voltou de verdade, e repetir o alerta so gastaria a atencao dele.
        ENVIADOS.clear()
        QUEBRADAS.discard("preflight")
        _passadas(4)
        sys.stdout, calado = saida, sys.stdout
        passou &= _conferir(
            "volta parcial nao dispara aviso novo", ENVIADOS == [], ENVIADOS)
        sys.stdout = calado

        # 5. Recuperacao total: um "voltou", e depois silencio. O `avisado_em`
        #    tem que zerar aqui, senao a volta se repete para sempre.
        ENVIADOS.clear()
        QUEBRADAS.clear()
        _passadas(10)
        sys.stdout, calado = saida, sys.stdout
        passou &= _conferir(
            "volta total avisa uma vez e cala",
            len(ENVIADOS) == 1 and ENVIADOS[0][1] == sentinela.SEV_NORMALIZADO
            and "voltou" in ENVIADOS[0][2], ENVIADOS)
        sys.stdout = calado

        # 6. Estado nao vaza: contador travado no limiar e nada de queda aberta.
        sys.stdout = saida
        with open(caminho, encoding="utf-8") as f:
            estado = json.load(f)
        passou &= _conferir(
            "estado final limpo",
            estado["contagem"] == {} and estado["avisado_em"] == 0
            and estado["assinatura"] == "",
            estado)
        # 7. Sem buraco no sinal de vida: 34 passadas, 34 batidas. Um buraco
        #    aqui faria a plataforma abrir `sentinela:parou-de-reportar` com a
        #    sentinela de pe — alerta certo apontando para o lugar errado.
        passou &= _conferir(
            "uma batida por passada, sem buraco",
            [t for t, _ in BATIDAS] == list(range(1, 35)),
            [t for t, _ in BATIDAS])
    finally:
        sys.stdout = saida

    print("\n" + ("TUDO CERTO" if passou else "A LOGICA DE DECISAO REGREDIU"))
    return 0 if passou else 1


if __name__ == "__main__":
    sys.exit(main())
