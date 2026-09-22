-- Rollback da 20260922261500: desagenda os dois crons e remove as funcoes.
--
-- Nada de dado e perdido: as linhas ja coletadas em openai_project_usage_daily /
-- openai_project_costs_daily e a fila openai_provision_queue continuam onde estao.
-- O efeito e so parar de provisionar e parar de atualizar o consumo.

select cron.unschedule('openai-provision-worker')
where exists (select 1 from cron.job where jobname = 'openai-provision-worker');

select cron.unschedule('openai-usage-sync-hourly')
where exists (select 1 from cron.job where jobname = 'openai-usage-sync-hourly');

select cron.unschedule('openai-usage-sync-daily')
where exists (select 1 from cron.job where jobname = 'openai-usage-sync-daily');

drop function if exists public.invoke_openai_provision_worker();
drop function if exists public.invoke_openai_usage_sync(integer);
