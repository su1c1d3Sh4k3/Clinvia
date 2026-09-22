#!/usr/bin/env bash
# Monitoramento pos-apply de storage.objects: alem de 42501/permission denied,
# pega "new row violates row-level security policy" (a mensagem real de INSERT
# barrado por policy -- o _mon_42501.sh nao a cobre).
# Uso: bash supabase/.temp/_mon_storage.sh [horas_para_tras]
set -euo pipefail
cd "$(dirname "$0")/../.."
HOURS="${1:-2}"
TOKEN=$(grep -oE '^SUPABASE_ACCESS_TOKEN=.*' .env | cut -d= -f2 | tr -d '\r')
REF=$(sed -n 's/.*"ref":"\([^"]*\)".*/\1/p' supabase/.temp/linked-project.json)
START=$(date -u -d "$HOURS hours ago" +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "janela UTC $START -> $END"
SQL="select timestamp, event_message from postgres_logs
     where (event_message like '%violates row-level security%'
            or event_message like 'permission denied%'
            or event_message like '%42501%')
       and event_message not like 'statement:%'
       and event_message not like '%_arnes%'
       and event_message not like '%for table _r%'
     order by timestamp desc limit 50"
curl -s -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "sql=$SQL" \
  --data-urlencode "iso_timestamp_start=$START" \
  --data-urlencode "iso_timestamp_end=$END"
echo
