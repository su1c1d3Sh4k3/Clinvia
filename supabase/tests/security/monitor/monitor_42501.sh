#!/usr/bin/env bash
# Monitoramento de 42501 / permission denied (regra do plano: 2h entre lotes).
# Uso: bash supabase/tests/security/monitor/monitor_42501.sh [horas_para_tras]
# Filtra os falsos positivos: o log de `statement:` repete o SQL do arnes (que
# menciona "permission denied" nos comentarios) e os erros das temp tables do
# proprio arnes (_res / _r) nao sao trafego real.
# Credenciais: le SUPABASE_ACCESS_TOKEN do .env da raiz. Nao guarde segredo aqui.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
HOURS="${1:-2}"
TOKEN=$(grep -oE '^SUPABASE_ACCESS_TOKEN=.*' .env | cut -d= -f2 | tr -d '\r')
REF=$(sed -n 's/.*"ref":"\([^"]*\)".*/\1/p' supabase/.temp/linked-project.json)
START=$(date -u -d "$HOURS hours ago" +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "janela UTC $START -> $END"
SQL="select timestamp, event_message from postgres_logs
     where (event_message like 'permission denied%' or event_message like '%42501%')
       and event_message not like 'statement:%'
       and event_message not like '%for table _r%'
       and event_message not like '%admin_get_support_profiles%'
     order by timestamp desc limit 50"
curl -s -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "sql=$SQL" \
  --data-urlencode "iso_timestamp_start=$START" \
  --data-urlencode "iso_timestamp_end=$END"
echo
