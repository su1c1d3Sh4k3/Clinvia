-- Rollback de 20260923200000_cron_health_watch.sql
--
-- Nao apaga incidentes ja abertos: eles sao registro do que aconteceu e
-- pertencem ao painel, nao a esta migration.

select cron.unschedule('cron-health-watch')
 where exists (select 1 from cron.job where jobname = 'cron-health-watch');

drop function if exists public.cron_health_scan(integer);
drop function if exists public.clinvia_http_post(text, text, text, jsonb, jsonb, integer);

drop table if exists public.cron_http_calls;
drop table if exists public.cron_health_seen;

delete from public.incident_catalog
 where pattern = 'respondeu 401' and source = 'db_job';

alter table public.llm_platform_settings
    drop column if exists cron_health_enabled,
    drop column if exists cron_health_last_response_id,
    drop column if exists cron_health_last_run_at,
    drop column if exists cron_health_timeout_ratio;
