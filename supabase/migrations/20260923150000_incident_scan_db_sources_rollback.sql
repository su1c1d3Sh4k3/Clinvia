-- Rollback de 20260923150000_incident_scan_db_sources.sql
--
-- NAO apaga incidente ja aberto: o que o varredor gravou e historico de falha
-- real e continua valendo depois de desligar a coleta.
--
-- Para so PARAR a varredura sem desfazer nada:
--   update public.llm_platform_settings set incident_db_scan_enabled = false;

select cron.unschedule('incident-scan-db-sources')
 where exists (select 1 from cron.job where jobname = 'incident-scan-db-sources');

drop function if exists public.incident_scan_db_sources(interval, integer);
drop function if exists public.incident_set_severidade_inicial(uuid, text);

alter table public.llm_platform_settings
    drop column if exists incident_db_scan_enabled;
