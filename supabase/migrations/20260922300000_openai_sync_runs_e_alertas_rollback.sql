-- Rollback da 20260922300000: desliga a varredura, tira os RPCs e derruba as duas
-- tabelas novas. Nao toca em dado de consumo (openai_project_usage_daily /
-- openai_project_costs_daily) — este arquivo nunca gravou nelas.
--
-- ATENCAO: derrubar openai_sync_runs perde o rastro de saude acumulado. Se a
-- intencao e so parar o ruido de alerta, prefira desligar pelas chaves:
--   update public.llm_platform_settings
--      set sync_alert_enabled = false,
--          zero_usage_alert_enabled = false,
--          daily_anomaly_alert_enabled = false,
--          updated_at = now()
--    where id;

select cron.unschedule('openai-alerts-scan')
where exists (select 1 from cron.job where jobname = 'openai-alerts-scan');

drop function if exists public.admin_get_openai_sync_health();
drop function if exists public.admin_get_openai_alerts(integer);
drop function if exists public.openai_alert_scan();

drop table if exists public.openai_alerts;
drop table if exists public.openai_sync_runs;

alter table public.llm_platform_settings
    drop column if exists sync_alert_enabled,
    drop column if exists sync_stale_hours,
    drop column if exists zero_usage_alert_enabled,
    drop column if exists zero_usage_baseline_requests,
    drop column if exists daily_anomaly_alert_enabled,
    drop column if exists daily_anomaly_factor,
    drop column if exists daily_anomaly_min_usd;
