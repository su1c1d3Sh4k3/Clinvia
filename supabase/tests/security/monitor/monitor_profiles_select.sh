#!/usr/bin/env bash
# Monitoramento do item 2 (leitura de profiles por tenant, migr 20260922290000).
# Uso: bash supabase/tests/security/monitor/monitor_profiles_select.sh [horas]
#
# Dois sinais:
#   1) 42501 em profiles = alguem pediu coluna sem grant (margem/segredo). ESPERADO
#      em sonda; se vier de trafego real, o front esta pedindo coluna proibida.
#   2) 200 com corpo vazio em GET /rest/v1/profiles = a tela ficou VAZIA porque a
#      policy cortou uma leitura legitima. ESSE e o sinal de regressao a vigiar.
# Credenciais: le SUPABASE_ACCESS_TOKEN do .env da raiz. Nao guarde segredo aqui.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
HOURS="${1:-2}"
TOKEN=$(grep -oE '^SUPABASE_ACCESS_TOKEN=.*' .env | cut -d= -f2 | tr -d '\r')
REF=$(sed -n 's/.*"ref":"\([^"]*\)".*/\1/p' supabase/.temp/linked-project.json)
START=$(date -u -d "$HOURS hours ago" +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "janela UTC $START -> $END"

echo "== 1) permission denied em profiles (postgres_logs) =="
SQL1="select timestamp, event_message from postgres_logs
      where event_message like '%permission denied%'
        and event_message like '%profiles%'
        and event_message not like 'statement:%'
      order by timestamp desc limit 50"
curl -s -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "sql=$SQL1" \
  --data-urlencode "iso_timestamp_start=$START" \
  --data-urlencode "iso_timestamp_end=$END"
echo

echo "== 2) GET /rest/v1/profiles por status (edge_logs) =="
SQL2="select r.status_code as status, count(*) as total
      from edge_logs t
      cross join unnest(t.metadata) as m
      cross join unnest(m.request) as q
      cross join unnest(m.response) as r
      where q.path like '/rest/v1/profiles%' and q.method = 'GET'
      group by r.status_code order by total desc limit 20"
curl -s -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "sql=$SQL2" \
  --data-urlencode "iso_timestamp_start=$START" \
  --data-urlencode "iso_timestamp_end=$END"
echo
