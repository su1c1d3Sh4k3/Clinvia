-- Verificacao da 20260922300000 (rastro de saude do sync + 3 alertas).
-- Roda como `postgres` pelo CLI. Nao escreve nada: so le estado e simula.
-- Uso: npx supabase db query --linked --file supabase/tests/security/item_4_openai_alertas/verify.sql
with objetos as (
  select 1 as ord,
         'TABELA | ' || c.relname
         || ' | rls=' || c.relrowsecurity::text
         || ' | policies=' || (select count(*) from pg_policies pp
                                where pp.schemaname = 'public' and pp.tablename = c.relname)::text
         || ' | anon=' || has_table_privilege('anon', 'public.' || c.relname, 'SELECT')::text
         || ' | authenticated=' || has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT')::text
         || ' | service_role=' || has_table_privilege('service_role', 'public.' || c.relname, 'SELECT')::text as info
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('openai_sync_runs', 'openai_alerts')
), cfg as (
  select 2 as ord,
         'CONFIG | stale_hours=' || s.sync_stale_hours::text
         || ' | baseline_reqs=' || s.zero_usage_baseline_requests::text
         || ' | fator=' || s.daily_anomaly_factor::text
         || ' | piso_usd=' || s.daily_anomaly_min_usd::text
         || ' | ligados: sync=' || s.sync_alert_enabled::text
         || ' zero=' || s.zero_usage_alert_enabled::text
         || ' anomalia=' || s.daily_anomaly_alert_enabled::text as info
  from public.llm_platform_settings s where s.id
), fns as (
  select 3 as ord,
         'FN | ' || p.proname || ' | secdef=' || p.prosecdef::text
         || ' | search_path=' || coalesce(array_to_string(p.proconfig, ','), '(sem)')
         || ' | anon_exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
         || ' | auth_exec=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text as info
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('openai_alert_scan', 'admin_get_openai_alerts', 'admin_get_openai_sync_health')
), job as (
  select 4 as ord, 'CRON | ' || jobname || ' | ' || schedule || ' | ativo=' || active::text as info
  from cron.job where jobname in ('openai-alerts-scan', 'openai-usage-sync-hourly', 'openai-usage-sync-daily')
), runs as (
  select 5 as ord, 'SYNC RUNS | total=' || count(*)::text
         || ' | ultimo_ok=' || coalesce(max(started_at) filter (where status = 'ok')::text, '(nenhum)') as info
  from public.openai_sync_runs
), alertas as (
  select 6 as ord, 'ALERTAS | ' || kind || ' | ' || count(*)::text
         || ' | ultimo=' || max(created_at)::text as info
  from public.openai_alerts group by kind
), sem_alerta as (
  select 7 as ord, 'ALERTAS | tabela vazia' as info
  where not exists (select 1 from public.openai_alerts)
), simula_zero as (
  -- Quem alertaria por zeragem AGORA se estivesse em horario comercial.
  select 8 as ord,
         'SIMULA ZERAGEM | ' || coalesce(p.company_name, p.full_name, p.id::text)
         || ' | reqs_hoje=' || coalesce(h.reqs, 0)::text
         || ' | media_7d=' || round(coalesce(b.media, 0), 1)::text
         || ' | alertaria=' || (coalesce(h.reqs, 0) = 0
              and coalesce(b.media, 0) >= (select zero_usage_baseline_requests from public.llm_platform_settings where id))::text as info
  from public.profiles p
  left join (select project_id, sum(num_model_requests) reqs from public.openai_project_usage_daily
              where day = (now() at time zone 'America/Sao_Paulo')::date group by project_id) h
         on h.project_id = p.openai_project_id
  left join (select project_id, avg(reqs) media from (
               select project_id, day, sum(num_model_requests) reqs from public.openai_project_usage_daily
                where day between (now() at time zone 'America/Sao_Paulo')::date - 7
                              and (now() at time zone 'America/Sao_Paulo')::date - 1
                group by project_id, day) d group by project_id) b
         on b.project_id = p.openai_project_id
  where p.openai_project_id is not null
), simula_anom as (
  select 9 as ord,
         'SIMULA ANOMALIA | ' || coalesce(p.company_name, p.full_name, p.id::text)
         || ' | usd_hoje=' || round(coalesce(h.usd, 0), 4)::text
         || ' | media_7d=' || round(coalesce(b.media, 0), 4)::text
         || ' | gatilho_usd=' || round(greatest(
               (select daily_anomaly_min_usd from public.llm_platform_settings where id),
               (select daily_anomaly_factor from public.llm_platform_settings where id) * coalesce(b.media, 0)), 2)::text
         || ' | alertaria=' || (coalesce(h.usd, 0) >= greatest(
               (select daily_anomaly_min_usd from public.llm_platform_settings where id),
               (select daily_anomaly_factor from public.llm_platform_settings where id) * coalesce(b.media, 0)))::text as info
  from public.profiles p
  left join (select project_id, sum(cost_usd) usd from public.openai_project_costs_daily
              where day = (now() at time zone 'America/Sao_Paulo')::date group by project_id) h
         on h.project_id = p.openai_project_id
  left join (select project_id, avg(usd) media from (
               select project_id, day, sum(cost_usd) usd from public.openai_project_costs_daily
                where day between (now() at time zone 'America/Sao_Paulo')::date - 7
                              and (now() at time zone 'America/Sao_Paulo')::date - 1
                group by project_id, day) d group by project_id) b
         on b.project_id = p.openai_project_id
  where p.openai_project_id is not null
), agora as (
  select 10 as ord, 'AGORA SP | ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
         || ' | dia_util=' || (extract(isodow from now() at time zone 'America/Sao_Paulo') between 1 and 5)::text
         || ' | horario_comercial=' || (extract(isodow from now() at time zone 'America/Sao_Paulo') between 1 and 5
              and extract(hour from now() at time zone 'America/Sao_Paulo') >= 8
              and extract(hour from now() at time zone 'America/Sao_Paulo') < 20)::text as info
)
select info from (
  select * from objetos union all select * from cfg union all select * from fns
  union all select * from job union all select * from runs union all select * from alertas
  union all select * from sem_alerta union all select * from simula_zero
  union all select * from simula_anom union all select * from agora
) t order by ord, info;
