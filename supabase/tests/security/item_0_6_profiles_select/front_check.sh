#!/usr/bin/env bash
# Confere, pela MESMA rota do navegador (PostgREST + RLS + grants de coluna), as
# 5 telas que leem a linha do DONO por ownerId. Roda como colaborador REAL da
# PELE: sessao criada por magiclink (nao envia e-mail) e descartada no fim.
# Uso: bash supabase/tests/security/item_0_6_profiles_select/front_check.sh
#
# Credenciais: SUPABASE_URL / SUPABASE_ANON_KEY do .env da raiz e a service key
# em supabase/.temp/_svc.txt. Nao guarde segredo aqui.
#
# PITFALL: /auth/v1/verify espera "token_hash", nao "token".
set -u
cd "$(dirname "$0")/../../../.."
SB_URL=$(grep -oP '(?<=^SUPABASE_URL=).*' .env | tr -d '\r')
ANON=$(grep -oP '(?<=^SUPABASE_ANON_KEY=).*' .env | tr -d '\r')
SVC=$(tr -d '\r\n' < supabase/.temp/_svc.txt)
OWNER='e697878e-29c9-4b7e-88bb-869f4f2c76af'

check_one() {
  local email="$1" rotulo="$2"
  local link tok jwt
  link=$(curl -s -X POST "$SB_URL/auth/v1/admin/generate_link" \
    -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"email\":\"$email\"}")
  tok=$(printf '%s' "$link" | grep -oP '(?<="hashed_token":")[^"]+')
  if [ -z "$tok" ]; then echo "$rotulo | FALHA ao gerar sessao: $(printf '%s' "$link" | head -c 200)"; return; fi
  jwt=$(curl -s -X POST "$SB_URL/auth/v1/verify" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"token_hash\":\"$tok\"}" | grep -oP '(?<="access_token":")[^"]+')
  if [ -z "$jwt" ]; then echo "$rotulo | FALHA ao trocar o token"; return; fi

  q() {
    local nome="$1" url="$2"
    local body
    body=$(curl -s "$SB_URL/rest/v1/$url" -H "apikey: $ANON" -H "Authorization: Bearer $jwt")
    echo "$rotulo | $nome | $(printf '%s' "$body" | head -c 220)"
  }

  q 'Configuracoes>Empresa (company_name, financial_access)' \
    "profiles?select=company_name,financial_access&id=eq.$OWNER"
  q 'Minha Conta (company_name)' \
    "profiles?select=company_name&id=eq.$OWNER"
  q 'Recorrencia (msgs padrao)' \
    "profiles?select=recurrence_default_msg_1,recurrence_default_msg_2,recurrence_default_msg_3,recurrence_dispatch_hour,recurrence_campaign_duration_days&id=eq.$OWNER"
  q 'Branding do orcamento' \
    "profiles?select=orcamento_header_url,orcamento_footer_text,company_name,phone&id=eq.$OWNER"
  q 'AutoCloseSettings' \
    "profiles?select=auto_close_enabled,auto_close_warning_minutes,auto_close_final_minutes,auto_close_warning_message,auto_close_final_message,auto_close_no_interaction_enabled,auto_close_no_interaction_hours,auto_close_no_interaction_include_customer&id=eq.$OWNER"
  q 'ISOLAMENTO: lista todos os profiles (deve vir so o dono)' \
    "profiles?select=id,company_name,email,tokens_total,approximate_cost_total"
  q 'ISOLAMENTO: pede outro tenant na marra (deve vir [])' \
    "profiles?select=id,company_name,email&id=eq.0bbd78f1-4873-4468-9363-b9cd3e16130f"
  q 'BLINDAGEM: pede a margem (deve dar 42501)' \
    "profiles?select=markup&id=eq.$OWNER"

  curl -s -X POST "$SB_URL/auth/v1/logout" -H "apikey: $ANON" -H "Authorization: Bearer $jwt" > /dev/null
}

check_one 'adriellycamilla201920@gmail.com' 'AGENTE (ADRIELLY)'
check_one 'dayanateixeirajr@gmail.com' 'SUPERVISOR (DAYANA)'
