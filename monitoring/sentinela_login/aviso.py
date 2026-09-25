#!/usr/bin/env python3
"""Os dois caminhos de saida da sentinela: WhatsApp direto e heartbeat.

Sao DOIS de proposito, e a diferenca entre eles e a razao de a sentinela
existir.

  WhatsApp direto  fala com a API oficial da Meta, sem Supabase no meio. E o
                   caminho que sobrevive a plataforma inteira estar fora — que
                   e exatamente o cenario que a sentinela vigia. Um aviso que
                   precise da plataforma para sair morre junto com o que ele
                   deveria denunciar.

  Heartbeat        POST para a plataforma a cada passada. Nao e um canal de
                   aviso: e o sinal de vida. Serve para (a) a falha aparecer no
                   painel do Super Admin junto com todo o resto, e (b) a
                   plataforma poder gritar quando a SENTINELA parar de falar.
                   Se ele nao sair, a sentinela nao considera isso falha da
                   aplicacao — heartbeat e observabilidade, nao medicao.

Quem vigia a sentinela
----------------------
Antes era um e-mail diario em horario fixo, cuja AUSENCIA era o sinal. Isso
pedia que ele reparasse na falta de uma mensagem, que e a coisa mais facil de
nao reparar. Agora quem repara e a plataforma: 10 minutos sem heartbeat abrem
`sentinela:parou-de-reportar`, que e critico e vai para o WhatsApp dele pelo
caminho normal de alerta. O diario foi REMOVIDO — supressao na origem, nao na
porta: nao ha mais mensagem de rotina para ele ignorar.

Credenciais que a caixa externa carrega
---------------------------------------
Uma maquina fora da plataforma e, por definicao, menos protegida que ela. Entao
ela so carrega o que nao abre nada:

  SENTINELA_META_TOKEN       token de system user com permissao de ENVIO e mais
                             nada (ver INSTALACAO.md). No pior caso, manda
                             mensagem pelo numero de alerta.
  SENTINELA_HEARTBEAT_KEY    segredo compartilhado do heartbeat. Abre UMA rota,
                             que so escreve linha de sinal de vida.
  SENTINELA_ANON_KEY         a mesma chave publica que esta no bundle do front.
  SENTINELA_SENHA            senha da conta interna da sentinela: admin de um
                             tenant VAZIO, fora de `admin_users`.

Nenhuma delas le dado de paciente. Trocar o buraco de observabilidade por um
buraco de seguranca seria um mau negocio.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

import probe

GRAPH_API = "https://graph.facebook.com/v22.0"
PAINEL_URL = "https://app.clinbia.ai/admin?tab=alertas"

# Os mesmos tres templates do `alert-notify`, na mesma ordem de preferencia.
# So o v2 esta APPROVED hoje; v3 e v4 ficaram PENDING. Manter a escada aqui faz
# a sentinela subir de degrau sozinha no minuto em que a Meta aprovar, sem
# ninguem precisar lembrar de vir editar este arquivo.
TPL_V4 = "sys_alerta_incidente_v4"
TPL_V3 = "sys_alerta_incidente_v3"
TPL_V2 = "sys_alerta_incidente_v2"
TPL_LANG = "pt_BR"

# "Esse template nao esta disponivel" — e SO isso. Qualquer outro codigo e falha
# do envio, e cair no degrau de baixo esconderia a falha real.
#   132001 nao existe nessa lingua · 132015 pausado · 132016 desabilitado
TPL_INDISPONIVEL = {"132001", "132015", "132016"}

COMPONENTE = "sentinela:aplicacao-inacessivel"

# Por que template e nao texto livre: a janela de 24h do destinatario so reabre
# se ELE responder, e a dele esta fechada desde 22/09/2026. Fora da janela a
# Meta ACEITA texto livre (200 + wamid real) e derruba depois, por webhook
# assincrono 131047 — o envio "deu certo" e a mensagem nunca chega. A sentinela
# nao tem como ver esse webhook: ele chega na plataforma, que pode estar fora.
# Entao ela nunca arrisca texto livre.


def sanitizar(valor: object, maximo: int = 900) -> str:
    """Parametro de template: uma linha, sem tab, sem 4+ espacos seguidos.

    A Meta recusa o envio inteiro com 132000 quando isso aparece. Espelha
    `sanitizeParam` do alert-notify — se um dos dois mudar, o outro tem que
    mudar junto, porque e o MESMO alerta por caminhos diferentes.
    """
    texto = " ".join(str(valor if valor is not None else "").split())
    if not texto:
        return "-"
    return texto[:maximo - 1] + "…" if len(texto) > maximo else texto


def _params(a: dict, template: str) -> list[str]:
    """Ordem das variaveis copiada de `alert-notify/index.ts`.

    Trocar a ordem aqui nao da erro: da uma mensagem com os campos nos rotulos
    errados, que e pior. Os tres blocos abaixo sao as tres assinaturas reais dos
    templates aprovados/pendentes.
    """
    # `Detectado`, nao `Falhou`: a sentinela e um DETECTOR. Dizer que ela falhou
    # quando ela funcionou foi um erro real deste projeto, em 23/09/2026.
    aconteceu = f"Detectado: {a['oQueAconteceu']}"
    if template == TPL_V4:
        return [a["severidade"], COMPONENTE, a["origem"], a["conta"], a["resolucao"],
                a["ocorrencias"], a["oQueFaz"], aconteceu, a["causa"], a["acao"], PAINEL_URL]
    if template == TPL_V3:
        return [a["severidade"], f"{COMPONENTE} | {a['resolucao']}", a["origem"], a["conta"],
                a["ocorrencias"], a["oQueFaz"], aconteceu, a["causa"], a["acao"], PAINEL_URL]
    # v2: 8 variaveis para 10 campos. O titulo de 4 campos entra na variavel que
    # o corpo aprovado prefixa com "Componente:", ficando um rotulo torto — a
    # mesma escolha que o alert-notify ja fez, pelo mesmo motivo: rotulo torto
    # hoje vale mais que rotulo certo em data desconhecida.
    titulo = " | ".join([COMPONENTE, a["origem"], a["conta"], a["resolucao"]])
    return [a["severidade"], titulo, f"{a['oQueFaz']} — DETECTADO: {a['oQueAconteceu']}",
            a["ocorrencias"], a["conta"], a["causa"], a["acao"], PAINEL_URL]


def _graph(cfg: dict, para: str, template: str, params: list[str]) -> tuple[bool, str]:
    """Devolve (enviou, codigo_de_erro). Codigo vazio quando deu certo."""
    corpo = json.dumps({
        "messaging_product": "whatsapp",
        "to": para,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": TPL_LANG},
            "components": [{
                "type": "body",
                "parameters": [{"type": "text", "text": sanitizar(p)} for p in params],
            }],
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{GRAPH_API}/{cfg['phone_id']}/messages", data=corpo, method="POST")
    req.add_header("Authorization", f"Bearer {cfg['token']}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", probe.USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=probe.TIMEOUT) as r:
            return r.status < 300, ""
    except urllib.error.HTTPError as e:
        bruto = e.read()[:400].decode("utf-8", "replace")
        try:
            erro = json.loads(bruto).get("error", {})
            codigo = str(erro.get("code", e.code))
            detalhe = erro.get("message", "")
        except ValueError:
            codigo, detalhe = str(e.code), bruto
        # O token NUNCA aparece no log, nem truncado. A mensagem de erro da Meta
        # nao o contem, mas o corpo enviado sim — por isso so o erro e impresso.
        print(f"graph erro {codigo}: {detalhe[:200]}", file=sys.stderr)
        return False, codigo
    except Exception as e:  # noqa: BLE001 — aviso que falha nao derruba a sonda
        print(f"graph {type(e).__name__}: {e}", file=sys.stderr)
        return False, ""


def enviar_whatsapp(cfg: dict, alerta: dict) -> bool:
    """Manda para todos os destinatarios. Verdadeiro se ALGUM recebeu.

    O teste de disponibilidade do template e o proprio erro da Meta, nao uma
    consulta de status: enquanto o v4 estiver PENDING o alerta sai no v3 ou no
    v2 e, no minuto em que a Meta aprovar, passa a sair no v4 sozinho.
    """
    if not (cfg.get("phone_id") and cfg.get("token") and cfg.get("para")):
        print("aviso: WhatsApp nao configurado, alerta nao saiu", file=sys.stderr)
        return False

    algum = False
    for numero in cfg["para"]:
        for template in (TPL_V4, TPL_V3, TPL_V2):
            enviou, codigo = _graph(cfg, numero, template, _params(alerta, template))
            if enviou:
                algum = True
                break
            if codigo not in TPL_INDISPONIVEL:
                break  # falha de envio de verdade: descer de degrau esconderia
    return algum


def heartbeat(cfg: dict, corpo: dict) -> bool:
    """Sinal de vida para a plataforma. Falhar aqui NAO e falha da aplicacao.

    A sentinela nao usa a resposta para nada e nao reclama alto quando ela nao
    vem: se o heartbeat nao chega, quem grita e a propria plataforma, 10 minutos
    depois. Reclamar aqui tambem so produziria dois alertas para um fato.
    """
    if not (cfg.get("url") and cfg.get("anon") and cfg.get("hb_key")):
        return False
    req = urllib.request.Request(
        f"{cfg['url']}/functions/v1/sentinela-heartbeat",
        data=json.dumps(corpo).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {cfg['anon']}")
    req.add_header("apikey", cfg["anon"])
    req.add_header("Content-Type", "application/json")
    req.add_header("x-sentinela-key", cfg["hb_key"])
    req.add_header("x-origin", "sentinela")
    req.add_header("User-Agent", probe.USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=probe.TIMEOUT) as r:
            return r.status < 300
    except Exception as e:  # noqa: BLE001
        print(f"heartbeat {type(e).__name__}: {e}", file=sys.stderr)
        return False


def config() -> dict:
    return {
        "url": os.environ.get("SENTINELA_SUPABASE_URL", "").rstrip("/"),
        "anon": os.environ.get("SENTINELA_ANON_KEY", ""),
        "hb_key": os.environ.get("SENTINELA_HEARTBEAT_KEY", ""),
        "phone_id": os.environ.get("SENTINELA_META_PHONE_ID", ""),
        "token": os.environ.get("SENTINELA_META_TOKEN", ""),
        "para": [n.strip() for n in
                 os.environ.get("SENTINELA_WHATSAPP_PARA", "").split(",") if n.strip()],
    }
