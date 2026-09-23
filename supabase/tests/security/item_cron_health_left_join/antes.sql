-- Estado ANTES de 20260923430000 (left join no bloco B2 do cron-health).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_cron_health_left_join/antes.sql
--
-- O que precisa ficar provado aqui:
--   1. que o bloco B2 usa `join` interno em cron.job;
--   2. quantas falhas de execucao isso apaga do relatorio, e de quais jobids;
--   3. que a causa NAO e o RLS de cron.job hoje — todos os jobs visiveis
--      pertencem ao usuario atual, e nenhum orfao esta vivo.

select jsonb_pretty(jsonb_build_object(
    'join_interno_no_bloco_B2', (
        select p.prosrc ilike '%join cron.job j on j.jobid = f.jobid%'
           and p.prosrc not ilike '%left join cron.job j on j.jobid = f.jobid%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),

    'freio_de_orfao_antigo_existe', (
        select p.prosrc ilike '%v_orfao_morto%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),

    -- A hipotese que eu levantei e que NAO se sustentou
    'hipotese_rls', jsonb_build_object(
        'policy_existe', exists (select 1 from pg_policy
                                  where polrelid = 'cron.job'::regclass
                                    and polname = 'cron_job_policy'),
        'rls_ligada', (select relrowsecurity from pg_class where oid = 'cron.job'::regclass),
        'eu_sou', current_user,
        'donos_dos_jobs_visiveis', (select jsonb_agg(distinct j.username) from cron.job j),
        'veredito', 'policy real, mas nao esconde nada hoje: todo job visivel e do usuario atual'),

    'falhas_7d', jsonb_build_object(
        'total', (select count(*) from cron.job_run_details d
                   where d.start_time > now() - interval '7 days'
                     and d.status not in ('succeeded','running')),
        'relatadas', (select count(*) from cron.job_run_details d
                       where d.start_time > now() - interval '7 days'
                         and d.status not in ('succeeded','running')
                         and exists (select 1 from cron.job j where j.jobid = d.jobid)),
        'apagadas_pelo_join', (select count(*) from cron.job_run_details d
                                where d.start_time > now() - interval '7 days'
                                  and d.status not in ('succeeded','running')
                                  and not exists (select 1 from cron.job j where j.jobid = d.jobid))),

    -- Nominalmente, e com o veredito vivo/morto que decide a severidade nova
    'jobids_sem_cadastro_7d', (
        select coalesce(jsonb_agg(jsonb_build_object(
                'jobid', s.jobid,
                'falhas_7d', s.falhas,
                'ok_7d', s.ok,
                'ultima_execucao', to_char(s.ult at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
                'h_desde_a_ultima', round(extract(epoch from (now() - s.ult))/3600, 1),
                'veredito', case when s.ult > now() - interval '30 minutes'
                                 then 'VIVO E ESCONDIDO' else 'removido' end,
                'comando', s.cmd) order by s.falhas desc), '[]'::jsonb)
          from (select d.jobid,
                       count(*) filter (where d.status not in ('succeeded','running')) as falhas,
                       count(*) filter (where d.status = 'succeeded')                  as ok,
                       max(d.start_time)                                               as ult,
                       left(coalesce(max(d.command), ''), 110)                         as cmd
                  from cron.job_run_details d
                 where d.start_time > now() - interval '7 days'
                   and not exists (select 1 from cron.job j where j.jobid = d.jobid)
                 group by d.jobid) s),

    'incidentes_cron_abertos_agora', (
        select coalesce(jsonb_agg(jsonb_build_object(
                'component', i.component, 'sev', i.ai_severity,
                'efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity))
            order by i.first_seen), '[]'::jsonb)
          from public.incidents i
         where i.status <> 'resolved' and i.component like 'cron%')
));
