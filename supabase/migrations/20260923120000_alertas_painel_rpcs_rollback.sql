-- Rollback de 20260923120000_alertas_painel_rpcs.sql
--
-- Seguro: estas 6 funcoes nasceram nesta migration e nada no banco depende delas.
-- Quem chama e so a pagina /admin?tab=alertas — derrubar as funcoes deixa a aba
-- com erro de leitura, nao quebra nenhum fluxo de cliente.

drop function if exists public.admin_list_incidents(text, text, text, integer);
drop function if exists public.admin_incident_counters();
drop function if exists public.admin_incident_detail(uuid);
drop function if exists public.admin_set_incident_status(uuid, text, text);
drop function if exists public.admin_alert_settings();
drop function if exists public.admin_set_alert_setting(text, text);
