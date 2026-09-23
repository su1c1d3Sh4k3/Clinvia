-- Rollback de 20260923160000_incident_recorrencia.sql
--
-- Volta ao comportamento anterior: cada incidente sem analise e candidato a IA e
-- a aviso, sem janela de silencio. NAO apaga incidente nem contagem — event_count,
-- first_seen/last_seen e notified_count sao historico real e continuam valendo.
--
-- Para so DESLIGAR a regra sem desfazer nada (recomendado antes de derrubar):
--   update public.llm_platform_settings
--      set incident_analyze_cooldown_min = 0,
--          incident_notify_cooldown_min  = 0;
--   -- cooldown 0 = sem reaproveitamento e sem silencio; a supressao some.

-- 1. Funcoes novas da fila
drop function if exists public.incident_claim_for_analysis(integer);
drop function if exists public.incident_finish_analysis(uuid, jsonb);
drop function if exists public.incident_claim_for_notification(integer);

-- 2. Colunas de estado da analise
drop index if exists public.incidents_analise_pendente_idx;
drop index if exists public.incidents_fingerprint_analisado_idx;

alter table public.incidents
    drop column if exists analysis_claimed_at,
    drop column if exists analysis_reused_from;

-- 3. Janelas
alter table public.llm_platform_settings
    drop column if exists incident_analyze_cooldown_min,
    drop column if exists incident_notify_cooldown_min;

-- 4. RPCs do painel voltam a versao de 20260923120000
--    (admin_list_incidents perde as colunas de recorrencia;
--     admin_set_incident_status perde o reset de reabertura;
--     admin_set_alert_setting/admin_alert_settings perdem as chaves novas.)
--
--    ATENCAO: admin_incident_detail NAO deve ser revertido — a versao de
--    20260923120000 seleciona `message` de incident_events, coluna que nao existe,
--    e estoura 42703 na primeira expansao de incidente no painel. A correcao veio
--    junto nesta migration de proposito.
--
--    Reaplique o arquivo original apos rodar este rollback:
--      npx supabase db query --linked --file supabase/migrations/20260923120000_alertas_painel_rpcs.sql
--    e depois recorrija admin_incident_detail (error_message/http_code).

drop function if exists public.admin_list_incidents(text, text, text, integer);
drop function if exists public.admin_set_incident_status(uuid, text, text);
drop function if exists public.admin_set_alert_setting(text, text);
drop function if exists public.admin_alert_settings();
