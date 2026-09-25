#!/usr/bin/env python3
"""Executor da sentinela: roda a sonda, decide se avisa, e avisa.

Divisao de trabalho
-------------------
`probe.py` so MEDE e devolve verdade crua. `aviso.py` so FALA (WhatsApp direto
pela Meta, e heartbeat para a plataforma). Este arquivo decide: quando um
tropeco vira incidente, quando avisar, e o que a mensagem diz.

Por onde o aviso sai
--------------------
WhatsApp DIRETO pela API oficial da Meta, sem Supabase no caminho. Esta
sentinela e a ultima linha: ela existe para o caso em que a plataforma esta
inacessivel, e um aviso que precise da plataforma para sair morre junto com o
que ele deveria denunciar.

Em paralelo, e para um proposito diferente, cada passada manda um heartbeat
para a plataforma. Ele nao e canal de aviso — e o que faz a falha aparecer no
painel do Super Admin junto com o resto, e o que permite a plataforma gritar
quando a SENTINELA parar de falar (10 min de silencio =
`sentinela:parou-de-reportar`, critico).

Essa vigilancia cruzada e o que aposentou o e-mail diario de sinal de vida: a
ausencia de uma mensagem de rotina e a coisa mais facil de nao reparar, e uma
mensagem de rotina todo dia ensina a ignorar mensagem. Agora quem repara e a
plataforma. Nao ha mais e-mail em lugar nenhum deste programa.

Confirmacao antes de avisar
---------------------------
Rodando de minuto em minuto, um tropeco de rede de um minuto vira alarme falso
— e alarme falso ensina a ignorar alarme, que e exatamente o que nao pode
acontecer com o canal dele. Por isso o aviso so sai apos CONFIRMACOES passadas
seguidas com a MESMA verificacao quebrada. Isso e supressao na ORIGEM (nao
existe incidente ainda), nao teto na porta: uma vez confirmado, o aviso sai, e
sai de novo a cada LEMBRETE_MIN enquanto durar, sem limite de quantidade.

A contagem e POR VERIFICACAO, nao por assinatura do conjunto. A diferenca so
aparece porque o login real e escalonado (abaixo): se a contagem fosse uma so,
a passada que pula o login mudaria a assinatura e zeraria o relogio de uma
falha que continua de pe. Cada verificacao tem o seu contador; a que nao foi
medida nesta passada nao e incrementada NEM zerada — fica como estava.

O heartbeat NAO espera confirmacao: ele leva a medicao crua toda passada. Quem
espera as tres e o aviso; o painel pode e deve ver o tropeco de um minuto.

Login real e escalonado
-----------------------
As verificacoes 1 a 6 sao leitura e rodam a cada minuto. A 7 escreve: 1440
grants por dia enchem `auth.sessions`, o log de auditoria, e arriscam limite de
taxa no GoTrue. Ela roda a cada LOGIN_A_CADA_MIN minutos — mas so enquanto
estiver passando: assim que falha, volta para cadencia de 1 minuto, porque
grant que falha nao cria sessao e portanto nao custa nada. O atraso maximo fica
em LOGIN_A_CADA_MIN + CONFIRMACOES minutos, e so quando a quebra for EXCLUSIVA
do grant de senha — tudo que o antecede (front, preflight, turnstile, GoTrue,
REST) continua medido de minuto em minuto.

Uso
---
    # as mesmas variaveis do probe.py, mais as de aviso.py:
    export SENTINELA_META_PHONE_ID=...
    export SENTINELA_META_TOKEN=...
    export SENTINELA_WHATSAPP_PARA=55...,55...
    export SENTINELA_HEARTBEAT_KEY=...
    export SENTINELA_ESTADO=/var/lib/sentinela/estado.json   # opcional

    python sentinela.py

Saida: 0 = tudo ok, 1 = ha falha (avisada ou ainda em confirmacao).
"""

from __future__ import annotations

import json
import os
import sys
import time

import aviso
import probe

# Passadas seguidas com a mesma verificacao quebrada antes de avisar. Em
# cadencia de 1 minuto, 3 = o login esta fora ha 3 minutos. Menos que isso pega
# oscilacao de rede da propria caixa que roda a sonda.
CONFIRMACOES = 3

# Enquanto a falha durar, relembra de tempos em tempos. Nao e teto de envio: e
# cadencia de UM incidente que continua aberto.
LEMBRETE_MIN = 30

# De quantos em quantos minutos o login real roda. Ver "Login real e
# escalonado" no cabecalho.
LOGIN_A_CADA_MIN = 5

# Folga para o relogio do agendador: sem ela, uma passada que atrasa 2 segundos
# empurra o login para a passada seguinte e a cadencia vira 6 min, depois 7.
TOLERANCIA_S = 30

ESTADO_PADRAO = "/var/lib/sentinela/estado.json"

SEV_CRITICO = "🔴 CRITICO"
SEV_NORMALIZADO = "🟢 NORMALIZADO"

# O que cada verificacao, quando quebra, costuma significar. Sem isto o alerta
# diz "preflight falhou" e ele precisa reabrir o post-mortem de 24/09 para
# lembrar o que isso quer dizer. Cada linha e um incidente real deste projeto.
CAUSA_PROVAVEL = {
    "front_html": "a hospedagem do front (EasyPanel/Cloudflare) nao esta servindo o index",
    "front_bundle": "deploy publicou um index apontando para um bundle que nao subiu — tela branca com o servidor respondendo 200",
    "preflight": "header novo no front sem entrar no Access-Control-Allow-Headers das functions: o navegador recusa a chamada ANTES de sair (incidente de 24/09/2026)",
    "verify_turnstile": "a function do captcha caiu ou perdeu a chave: e a primeira chamada dos tres caminhos de login",
    "auth_health": "o GoTrue do Supabase esta fora",
    "rest_anon": "PostgREST fora, ou a leitura anonima da tela de login perdeu o grant",
    probe.LOGIN_REAL: "o grant de senha parou de funcionar, ou RLS/grant derrubou quem acabou de entrar",
}

ACAO = ("Abrir https://app.clinbia.ai numa aba anonima e conferir. "
        "Esta medicao vem de FORA e reproduz o navegador, inclusive o preflight de CORS: "
        "o painel de incidentes pode estar verde e isto vermelho ao mesmo tempo, "
        "porque as coberturas sao diferentes.")

O_QUE_FAZ = ("mede de fora da plataforma se a aplicacao esta acessivel, "
             "reproduzindo o que o navegador faz no login")


# ─────────────────────────────── estado ───────────────────────────────

def ler_estado(caminho: str) -> dict:
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        # Estado perdido e recuperavel: a proxima passada reconstroi. O que nao
        # pode e a sentinela morrer por causa do proprio arquivo de rascunho.
        return {}


def gravar_estado(caminho: str, estado: dict) -> None:
    try:
        pasta = os.path.dirname(caminho)
        if pasta:
            os.makedirs(pasta, exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False)
    except OSError as e:
        print(f"aviso: nao consegui gravar o estado em {caminho}: {e}",
              file=sys.stderr)


# ─────────────────────────────── mensagem ───────────────────────────────

def _causas(nomes: list[str]) -> str:
    vistas = [CAUSA_PROVAVEL[n] for n in nomes if n in CAUSA_PROVAVEL]
    if not vistas:
        return "nao identificada pela sonda"
    # Uma so causa quando ha uma so quebra. Varias quebras juntas quase sempre
    # tem causa unica a montante (a plataforma inteira fora), e listar quatro
    # hipoteses ao mesmo tempo atrapalharia em vez de ajudar.
    if len(vistas) > 1:
        return ("varias verificacoes cairam juntas, o que costuma ser uma causa so a montante "
                "(hospedagem, Supabase ou rede). Primeira hipotese: " + vistas[0])
    return vistas[0]


def alerta_queda(falhas: list[dict], minutos: int) -> dict:
    return {
        "severidade": SEV_CRITICO,
        "origem": "Sonda externa",
        # Login fora e login fora para todo mundo: nao ha recorte de tenant.
        "conta": "Todos os clientes",
        "resolucao": "Equipe Clinvia",
        "ocorrencias": f"fora ha {minutos} min",
        "oQueFaz": O_QUE_FAZ,
        "oQueAconteceu": "; ".join(f"{f['verificacao']}: {f['detalhe']}" for f in falhas),
        "causa": _causas([f["verificacao"] for f in falhas]),
        "acao": ACAO,
    }


def alerta_volta(minutos: int, restantes: list[str]) -> dict:
    # Nunca dizer "tudo passou" quando nao passou: uma quebra nova pode ter
    # comecado na mesma passada em que a antiga se resolveu.
    pendente = (f"ainda em confirmacao, sem aviso: {', '.join(restantes)}"
                if restantes else "todas as verificacoes passaram")
    return {
        "severidade": SEV_NORMALIZADO,
        "origem": "Sonda externa",
        "conta": "Todos os clientes",
        "resolucao": "Nada a fazer",
        "ocorrencias": f"ficou fora {minutos} min",
        "oQueFaz": O_QUE_FAZ,
        "oQueAconteceu": f"a aplicacao voltou a responder de fora ({pendente})",
        "causa": "nenhuma — este e o aviso de normalizacao do alerta anterior",
        "acao": "nenhuma acao necessaria; conferir o painel se quiser o historico da janela",
    }


# ─────────────────────────────── contagem ───────────────────────────────

def atualizar_contagem(anterior: dict, r: dict, agora: int) -> dict:
    """Contador de confirmacoes por verificacao.

    Medida e passou -> some. Medida e falhou -> incrementa (guardando quando
    caiu). NAO medida -> fica exatamente como estava: uma verificacao que nao
    rodou nao e prova de nada, nem a favor nem contra.
    """
    contagem = {k: dict(v) for k, v in anterior.items()}
    for x in r["resultados"]:
        nome = x["verificacao"]
        if x["ok"]:
            contagem.pop(nome, None)
            continue
        antes = contagem.get(nome, {})
        contagem[nome] = {
            # Trava em CONFIRMACOES: passado o limiar o numero nao decide mais
            # nada, e um contador que so cresce por meses polui o estado. Ha
            # quanto tempo esta fora e `caiu_em`, que e o dado honesto.
            "seguidas": min(antes.get("seguidas", 0) + 1, CONFIRMACOES),
            "caiu_em": antes.get("caiu_em", agora),
            "detalhe": x["detalhe"],
        }
    return contagem


# ─────────────────────────────── ciclo ───────────────────────────────

def main() -> int:
    caminho = os.environ.get("SENTINELA_ESTADO", ESTADO_PADRAO)
    cfg = aviso.config()

    estado = ler_estado(caminho)
    agora = int(time.time())

    # O racionamento vale para o caminho SAUDAVEL, que e o unico que custa
    # caro: cada grant bem-sucedido e uma sessao em `auth.sessions` e uma linha
    # de auditoria. Grant que FALHA nao cria sessao nenhuma. Entao, enquanto o
    # login estiver quebrado, ele volta a ser medido de minuto em minuto — do
    # contrario confirmar (3 medicoes) custaria 15 minutos, o triplo dos 4 que
    # o escalonamento deveria custar. Assim o pior caso e 5 (cadencia) + 3
    # (confirmacao) = 8 min, e o tipico ~5.
    ultimo_login = estado.get("ultimo_login_real", 0)
    incluir_login = (
        probe.LOGIN_REAL in estado.get("contagem", {})
        or agora - ultimo_login >= LOGIN_A_CADA_MIN * 60 - TOLERANCIA_S
    )
    r = probe.rodar(incluir_login=incluir_login)
    if incluir_login:
        ultimo_login = agora

    contagem = atualizar_contagem(estado.get("contagem", {}), r, agora)
    confirmadas = sorted(k for k, v in contagem.items()
                         if v["seguidas"] >= CONFIRMACOES)
    assinatura = ",".join(confirmadas)

    # Quebrou MAIS COISA do que ele ja viu: o aviso sai na hora, sem esperar o
    # lembrete. So o crescimento do conjunto faz isso — quando ele encolhe, o
    # relogio do lembrete continua de onde estava, senao a recuperacao parcial
    # de uma verificacao viraria um alerta novo dizendo o mesmo que o anterior.
    ja_avisadas = set(filter(None, estado.get("assinatura", "").split(",")))
    novas = set(confirmadas) - ja_avisadas
    avisado_em = 0 if novas else estado.get("avisado_em", 0)
    caiu_em = min((contagem[k]["caiu_em"] for k in confirmadas), default=agora)

    if confirmadas:
        if not avisado_em or agora - avisado_em >= LEMBRETE_MIN * 60:
            minutos = max(1, (agora - caiu_em) // 60)
            falhas = [{"verificacao": k, "detalhe": contagem[k]["detalhe"]}
                      for k in confirmadas]
            if aviso.enviar_whatsapp(cfg, alerta_queda(falhas, minutos)):
                avisado_em = agora
    elif avisado_em:
        # Volta: so avisa se a queda chegou a ser avisada. Falha que morreu
        # durante a confirmacao nunca existiu para ele, e "voltou" sem "caiu"
        # e ruido puro. Zerar aqui e obrigatorio: sem isso a proxima passada
        # leria o mesmo `avisado_em` e mandaria "voltou" de novo, para sempre.
        minutos = max(1, (agora - estado.get("caiu_em", agora)) // 60)
        aviso.enviar_whatsapp(cfg, alerta_volta(minutos, sorted(contagem)))
        avisado_em = 0

    # Heartbeat DEPOIS do aviso, e sempre — inclusive na passada em que tudo
    # passou, que e justamente a que prova que a caixa esta viva. Leva a medicao
    # crua: o painel ve o tropeco de um minuto que o WhatsApp, de proposito,
    # ainda nao viu.
    aviso.heartbeat(cfg, {
        "medido_em": r["quando"],
        "ok": not contagem,
        "falhas": r["falhas"],
        "confirmadas": confirmadas,
        "detalhe": {k: v["detalhe"] for k, v in contagem.items()},
        "caiu_em": caiu_em if confirmadas else None,
        "avisado": bool(avisado_em),
        "login_medido": r["login_medido"],
    })

    gravar_estado(caminho, {
        "contagem": contagem,
        "assinatura": assinatura,
        "caiu_em": caiu_em,
        "avisado_em": avisado_em,
        "ultimo_login_real": ultimo_login,
        "ultima_ok": agora if not contagem else estado.get("ultima_ok", 0),
    })

    if "--json" in sys.argv:
        print(json.dumps({**r, "contagem": contagem,
                          "confirmadas": confirmadas,
                          "avisado": bool(avisado_em)}, ensure_ascii=False))
    elif not contagem:
        medidas = len(r["resultados"])
        extra = "" if incluir_login else f" (login real em {LOGIN_A_CADA_MIN} min)"
        print(f"ok  {r['quando']}  todas as {medidas} passaram{extra}")
    else:
        estagio = ("avisado" if avisado_em else "confirmando")
        print(f"FALHA {r['quando']}  ({estagio})")
        for nome in sorted(contagem):
            v = contagem[nome]
            print(f"      {nome} {v['seguidas']}/{CONFIRMACOES}: {v['detalhe']}")
    return 0 if not contagem else 1


if __name__ == "__main__":
    sys.exit(main())
