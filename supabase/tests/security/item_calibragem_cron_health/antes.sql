-- Estado ANTES de 20260923420000 (calibragem do cron-health-watch).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_calibragem_cron_health/antes.sql
--
-- O que este retrato precisa provar, para o `verify.sql` poder cobrar depois:
--   1. que TODA falha de execucao nasce `alta`, sem olhar o placar do job;
--   2. que uma rajada (varios jobs caindo no MESMO minuto) vira N incidentes;
--   3. que o varredor e CEGO para jobs de outro dono (o `join cron.job`).

select jsonb_pretty(jsonb_build_object(
    'severidade_hardcoded_no_bloco_B', (
        select (p.prosrc ilike '%v_cron_erros := v_cron_erros + 1;%'
            and p.prosrc ilike '%incident_set_severidade_inicial((v_res ->> ''incident_id'')::uuid, ''alta'')%')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),

    -- O placar JA e calculado; o que nao existe e ele MODULAR a severidade.
    'placar_calculado', (
        select p.prosrc ilike '%as falhas_2h%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),
    'placar_modula_severidade', (
        select p.prosrc ilike '%v_reg.ok_24h%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),

    'agrupa_rajada', (
        select p.prosrc ilike '%cron-infra:%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='cron_health_scan'),

    'piso_do_catalogo', (
        select jsonb_agg(jsonb_build_object('component', c.component, 'sev', c.severidade_padrao)
                order by c.component)
          from public.incident_component_catalog c
         where c.component in ('cron:', 'cron-infra:')),

    -- Os 9 falsos positivos, nominalmente
    'incidentes_cron_abertos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                'componente', i.component,
                'sev_ia', i.ai_severity,
                'efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity),
                'eventos', i.event_count,
                'notificado', i.notified_count,
                'quando', to_char(i.first_seen at time zone 'America/Sao_Paulo','DD/MM HH24:MI'))
            order by i.first_seen, i.component), '[]'::jsonb)
          from public.incidents i
         where i.status <> 'resolved' and i.component like 'cron%'),

    -- A prova de que sao UMA rajada, nao 9 defeitos
    'minutos_com_3_ou_mais_jobs_falhando_7d', (
        select coalesce(jsonb_agg(x order by x->>'minuto'), '[]'::jsonb) from (
            select jsonb_build_object(
                    'minuto', to_char(date_trunc('minute', d.start_time) at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
                    'jobs_distintos', count(distinct d.jobid),
                    'mensagem', mode() within group (order by left(coalesce(d.return_message,''), 40))) as x
              from cron.job_run_details d
             where d.start_time > now() - interval '7 days'
               and d.status not in ('succeeded','running')
             group by date_trunc('minute', d.start_time)
            having count(distinct d.jobid) >= 3) s),

    -- A cegueira: jobs que executam e falham, mas nao aparecem em cron.job
    'jobs_invisiveis_para_o_varredor_24h', (
        select coalesce(jsonb_agg(x order by (x->>'falhas')::int desc), '[]'::jsonb) from (
            select jsonb_build_object(
                    'jobid', d.jobid,
                    'falhas', count(*),
                    'ok', count(*) filter (where d.status = 'succeeded'),
                    'comando', left(coalesce(max(d.command), ''), 120),
                    'erro', left(coalesce(max(d.return_message), ''), 120)) as x
              from cron.job_run_details d
             where d.start_time > now() - interval '24 hours'
               and not exists (select 1 from cron.job j where j.jobid = d.jobid)
             group by d.jobid
            having count(*) filter (where d.status not in ('succeeded','running')) > 0) s),

    'observacao', 'cron.job tem RLS com (username = CURRENT_USER); job de outro dono some do join'
));
