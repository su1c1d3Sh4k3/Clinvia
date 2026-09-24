#!/usr/bin/env python3
"""Executor da sentinela: roda a sonda, decide se avisa, e avisa.

Divisao de trabalho
-------------------
`probe.py` so MEDE e devolve verdade crua. Este arquivo decide o que fazer com
ela: quando um tropeco vira incidente, quando avisar, e por onde.

Por que o aviso sai por e-mail direto
-------------------------------------
Esta sentinela e a ultima linha: ela existe para o caso em que a plataforma
esta inacessivel. Um aviso que precise da plataforma para sair morre junto com
o que ele deveria denunciar. Entao o caminho e HTTP direto para a Resend, um
terceiro, sem Supabase no meio.

Isso tambem decide QUAL credencial a caixa externa carrega: **so a chave da
Resend**. Uma maquina fora da plataforma e por definicao menos protegida que
ela; dar a ela uma chave que le o banco inteiro trocaria um buraco de
observabilidade por um buraco de seguranca. A chave da Resend, no pior caso,
manda e-mail.

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

Quem vigia a sentinela
----------------------
Ela roda numa caixa de fora; se a caixa morrer, ela fica muda, e silencio e
indistinguivel de "tudo bem". Por isso um e-mail diario em horario fixo
(SENTINELA_DIARIO_HORA). A ausencia dele e o sinal. Ele sai mesmo com falha
aberta: o diario prova que a SENTINELA esta viva, nao que a aplicacao esta.

Uso
---
    # as mesmas variaveis do probe.py, mais:
    export SENTINELA_RESEND_KEY=re_...
    export SENTINELA_EMAIL_PARA=voce@dominio,outro@dominio
    export SENTINELA_ESTADO=/var/lib/sentinela/estado.json   # opcional
    export SENTINELA_DIARIO_HORA=08:00                       # opcional

    python sentinela.py

Saida: 0 = tudo ok, 1 = ha falha (avisada ou ainda em confirmacao).
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

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

DIARIO_HORA_PADRAO = "08:00"

ESTADO_PADRAO = "/var/lib/sentinela/estado.json"
RESEND_API = "https://api.resend.com/emails"
REMETENTE = "Sentinela Clinvia <nao-responda@clinbia.ai>"


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


# ─────────────────────────────── aviso ───────────────────────────────

def enviar_email(chave: str, para: list[str], assunto: str, corpo: str) -> bool:
    req = urllib.request.Request(
        RESEND_API,
        data=json.dumps({
            "from": REMETENTE,
            "to": para,
            "subject": assunto,
            "text": corpo,
        }).encode("utf-8"),
        method="POST",
    )
    # A Resend tambem esta atras da Cloudflare, que recusa `Python-urllib/*`
    # com 403 `error code: 1010` — medido em 24/09/2026. O aviso caia calado
    # justamente na hora em que ele e a unica coisa que importa.
    req.add_header("User-Agent", probe.USER_AGENT)
    req.add_header("Authorization", f"Bearer {chave}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=probe.TIMEOUT) as r:
            return r.status < 300
    except urllib.error.HTTPError as e:
        print(f"resend HTTP {e.code}: {e.read()[:200]!r}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — aviso que falha nao derruba a sonda
        print(f"resend {type(e).__name__}: {e}", file=sys.stderr)
    return False


def corpo_queda(r: dict, falhas: list[dict], minutos: int) -> str:
    linhas = [
        "A aplicacao nao esta acessivel de fora.",
        "",
        f"Fora ha: {minutos} min",
        f"Medido em: {r['quando']}",
        "",
        "O QUE QUEBROU",
    ]
    linhas += [f"  {f['verificacao']}: {f['detalhe']}" for f in falhas]
    linhas += [
        "",
        "O QUE AINDA RESPONDE",
    ]
    ok = [x for x in r["resultados"] if x["ok"]]
    linhas += [f"  {x['verificacao']}: {x['detalhe']}" for x in ok] or ["  nada"]
    linhas += [
        "",
        "Esta medicao vem de fora da plataforma e reproduz o que o NAVEGADOR",
        "faz, inclusive o preflight de CORS. O painel de incidentes pode estar",
        "verde e isto aqui vermelho ao mesmo tempo: sao coberturas diferentes.",
    ]
    return "\n".join(linhas)


def corpo_volta(r: dict, minutos: int, restantes: list[str]) -> str:
    linhas = [
        "A aplicacao voltou a responder de fora.",
        "",
        f"Ficou fora: {minutos} min",
        f"Medido em: {r['quando']}",
        "",
    ]
    # Nunca dizer "tudo passou" quando nao passou: uma quebra nova pode ter
    # comecado na mesma passada em que a antiga se resolveu.
    if restantes:
        linhas.append("Em confirmacao (ainda nao avisado): " + ", ".join(restantes))
    else:
        linhas.append("Todas as verificacoes passaram.")
    return "\n".join(linhas)


def corpo_diario(r: dict, quedas: int, pendentes: list[str]) -> str:
    linhas = [
        "A sentinela esta viva.",
        "",
        f"Ultima medicao: {r['quando']}",
        f"Avisos de queda desde o diario anterior: {quedas}",
        "",
        "ULTIMA PASSADA",
    ]
    for x in r["resultados"]:
        linhas.append(f"  {'ok   ' if x['ok'] else 'FALHA'} "
                      f"{x['verificacao']}: {x['detalhe']}")
    if not r.get("login_medido", True):
        linhas.append(f"  (login real roda a cada {LOGIN_A_CADA_MIN} min; "
                      "nao coube nesta passada)")
    if pendentes:
        linhas += ["", "FALHAS AINDA ABERTAS", "  " + ", ".join(pendentes)]
    linhas += [
        "",
        "Este e-mail e o sinal de vida da propria sentinela, que roda fora da",
        "plataforma. Se ele deixar de chegar neste horario, quem morreu foi ela",
        "— e a partir dai o silencio nao significa mais que esta tudo bem.",
    ]
    return "\n".join(linhas)


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


def talvez_diario(estado: dict, r: dict, contagem: dict,
                  chave: str, para: list[str]) -> str:
    """Manda o sinal de vida se ja passou do horario e ele nao saiu hoje.

    Devolve a data do ultimo diario (nova ou a antiga). Se o envio falhar, a
    data NAO avanca: a proxima passada tenta de novo, que e o comportamento
    certo para o unico e-mail cuja ausencia e o alarme.
    """
    hora_alvo = os.environ.get("SENTINELA_DIARIO_HORA", DIARIO_HORA_PADRAO)
    anterior = estado.get("ultimo_diario", "")
    hoje = time.strftime("%Y-%m-%d")
    if anterior == hoje or time.strftime("%H:%M") < hora_alvo:
        return anterior
    if not (chave and para):
        return anterior

    quedas = estado.get("quedas_desde_diario", 0)
    pendentes = sorted(contagem)
    assunto = ("[SENTINELA] Diario: tudo certo" if not pendentes
               else f"[SENTINELA] Diario: falha aberta ({', '.join(pendentes)})")
    if enviar_email(chave, para, assunto, corpo_diario(r, quedas, pendentes)):
        return hoje
    return anterior


# ─────────────────────────────── ciclo ───────────────────────────────

def main() -> int:
    caminho = os.environ.get("SENTINELA_ESTADO", ESTADO_PADRAO)
    chave = os.environ.get("SENTINELA_RESEND_KEY", "")
    para = [e.strip() for e in
            os.environ.get("SENTINELA_EMAIL_PARA", "").split(",") if e.strip()]

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
    quedas = estado.get("quedas_desde_diario", 0)

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
            if chave and para and enviar_email(
                    chave, para,
                    f"[SENTINELA] Aplicacao inacessivel: {assinatura}",
                    corpo_queda(r, falhas, minutos)):
                avisado_em = agora
                quedas += 1
    elif avisado_em:
        # Volta: so avisa se a queda chegou a ser avisada. Falha que morreu
        # durante a confirmacao nunca existiu para ele, e "voltou" sem "caiu"
        # e ruido puro. Zerar aqui e obrigatorio: sem isso a proxima passada
        # leria o mesmo `avisado_em` e mandaria "voltou" de novo, para sempre.
        minutos = max(1, (agora - estado.get("caiu_em", agora)) // 60)
        if chave and para:
            enviar_email(chave, para,
                         f"[SENTINELA] Aplicacao voltou ({minutos} min fora)",
                         corpo_volta(r, minutos, sorted(contagem)))
        avisado_em = 0

    ultimo_diario = talvez_diario(estado, r, contagem, chave, para)
    if ultimo_diario != estado.get("ultimo_diario", ""):
        quedas = 0

    gravar_estado(caminho, {
        "contagem": contagem,
        "assinatura": assinatura,
        "caiu_em": caiu_em,
        "avisado_em": avisado_em,
        "ultimo_login_real": ultimo_login,
        "ultimo_diario": ultimo_diario,
        "quedas_desde_diario": quedas,
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
