#!/usr/bin/env bash
# Exercita o guard `checkAppointmentIds` da `api-scheduling` contra a function
# PUBLICADA, com as quatro strings que o agente REALMENTE mandou em producao.
#
# POR QUE ISTO PRECISA EXISTIR:
# o conserto `8fb7516` nasceu conferido so em unidade — o proprio user resumiu:
# "correcao que nao foi exercitada e meia correcao". O que faltava era a chave da
# API, que nao esta no `.env` nem no vault (a Management API so devolve digest
# SHA-256). Ela esta em texto puro dentro do no `cancel_appointment` do n8n.
#
# POR QUE ESTE TESTE NAO PODE CHEGAR NO TELEFONE DELE:
#   * `cancel_appointment` e `reschedule_appointment` NAO resolvem conversa: o
#     guard e a primeira coisa depois do `missingFields`, entao nada e lido nem
#     escrito em `appointments`;
#   * o guard responde por `apiError`, que tem `report` DESLIGADO por padrao —
#     erro de entrada nao e defeito nosso e nao vira incidente;
#   * antes de disparar, confira que o bundle publicado tem o guard:
#       curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
#         https://api.supabase.com/v1/projects/<ref>/functions/api-scheduling/body \
#         | grep -c invalid_appointment_id
#     Sem essa conferencia o teste vira uma aposta: um guard ausente devolveria
#     22P02 -> 500 -> incidente com piso `alta` -> WhatsApp dele.
#
# A CHAVE NAO MORA AQUI DE PROPOSITO. Passe por ambiente:
#   SCHEDULING_API_KEY=... CONV_ID=... USER_ID=... bash verify.sh

set -u
URL="${API_URL:-https://swfshqvvbohnahdyndch.supabase.co/functions/v1/api-scheduling}"
: "${SCHEDULING_API_KEY:?defina SCHEDULING_API_KEY (esta no no cancel_appointment do n8n)}"
: "${USER_ID:?defina USER_ID}"
: "${CONV_ID:?defina CONV_ID (so o confirm_appointment resolve conversa)}"

caso() {
    printf '%-56s ' "$1"
    curl -s -X POST "$URL" -H "x-api-key: $SCHEDULING_API_KEY" \
        -H "Content-Type: application/json" -d "$2" -w '\n%{http_code}' \
    | python -c '
import sys, json
t = sys.stdin.read().strip().split("\n")
http = t[-1]
try:    code = json.loads("\n".join(t[:-1])).get("code")
except Exception: code = "(corpo ilegivel)"
esperado = sys.argv[1]
print(f"http={http} code={code}", "ok" if f"{http}/{code}" == esperado else f"FALHOU (esperado {esperado})")
' "$3"
}

# Os quatro rotulos abaixo sao citacoes: foi isso que a IA mandou, nos dias
# 16/09, 17/09 e 23/09 (duas vezes). Nenhum deles e UUID.
caso "1 cancel / data-hora        (real 23/09 15:45)" \
     "{\"action\":\"cancel_appointment\",\"user_id\":\"$USER_ID\",\"appointment_id\":\"23/09/2026 17:30\"}" \
     "400/invalid_appointment_id"

caso "2 cancel / nome do servico  (real 16/09)" \
     "{\"action\":\"cancel_appointment\",\"user_id\":\"$USER_ID\",\"appointment_id\":\"AVALIAÇÃO / PROCEDIMENTO\"}" \
     "400/invalid_appointment_id"

caso "3 reschedule / ISO          (real 23/09 13:57)" \
     "{\"action\":\"reschedule_appointment\",\"user_id\":\"$USER_ID\",\"appointment_id\":\"2026-09-25T17:00:00-03:00\",\"new_date\":\"2026-09-26\",\"new_time\":\"10:00\"}" \
     "400/invalid_appointment_id"

caso "4 reschedule / rotulo longo (real 17/09)" \
     "{\"action\":\"reschedule_appointment\",\"user_id\":\"$USER_ID\",\"appointment_id\":\"... 17/09 às 08:30, 02 SALA PROCEDIMENTO 08\",\"new_date\":\"2026-09-26\",\"new_time\":\"10:00\"}" \
     "400/invalid_appointment_id"

# O confirm aceita lista, e a lista VAZIA e legitima (confirma o lote inteiro):
# por isso o guard so roda quando vem item, e a mensagem tem de nomear o campo
# no plural.
caso "5 confirm / lista com rotulo" \
     "{\"action\":\"confirm_appointment\",\"user_id\":\"$USER_ID\",\"conversation_id\":\"$CONV_ID\",\"appointment_ids\":[\"23/09/2026 17:30\"]}" \
     "400/invalid_appointment_id"

# Sem este controle o teste nao valeria nada: um guard que recusa TUDO passaria
# nos cinco de cima. UUID bem formado tem de atravessar o guard e morrer la na
# frente, como "nao encontrado" — nunca como 500.
caso "6 CONTROLE uuid valido inexistente" \
     "{\"action\":\"cancel_appointment\",\"user_id\":\"$USER_ID\",\"appointment_id\":\"3f8a1c2e-5b7d-4e91-a0c6-2d4f8b9e1a37\"}" \
     "404/appointment_not_found"

echo
echo "Feche a prova conferindo que NADA nasceu (tem de voltar vazio):"
echo "  select * from public.incident_events where received_at >= now() - interval '10 minutes';"
