-- Estado DEPOIS de 20260923430000 (left join no bloco B2 do cron-health).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_cron_health_left_join/verify.sql
--
-- A janela que o varredor le e de 2h, e a falha de orfao mais recente tem 5h.
-- Entao rodar o scan agora NAO prova nada por si: a prova util aqui e (1) o
-- codigo novo estar mesmo no lugar, (2) o privilegio nao ter sido perdido no
-- `create or replace`, e (3) um REPLAY somente-leitura de 7 dias mostrando o que
-- o criterio novo faria com as falhas que o join interno apagava — inclusive que
-- nenhuma delas toca o telefone.

with base as (
    select p.prosrc, p.oid, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cron_health_scan'
),

-- ── replay somente leitura: 7 dias com a logica nova ────────────────────────
falhas as (
    select d.runid, d.jobid, d.status, d.start_time, d.command,
           date_trunc('minute', d.start_time) as minuto
      from cron.job_run_details d
     where d.start_time >= now() - interval '7 days'
       and d.status is distinct from 'succeeded'
       and d.status is distinct from 'running'
),
minutos as (
    select minuto, count(distinct jobid) as jobs_no_minuto
      from falhas group by minuto
),
avulsas as (
    select f.runid, f.jobid,
           coalesce(j.jobname, 'jobid-' || f.jobid) as jobname,
           (j.jobid is null)                        as sem_cadastro,
           coalesce(j.command, f.command)           as command,
           f.start_time,
           (select count(*) from cron.job_run_details x
             where x.jobid = f.jobid and x.start_time >= f.start_time - interval '24 hours'
               and x.start_time <= f.start_time
               and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_24h,
           (select count(*) from cron.job_run_details x
             where x.jobid = f.jobid and x.start_time >= f.start_time - interval '24 hours'
               and x.start_time <= f.start_time
               and x.status = 'succeeded') as ok_24h
      from falhas f
      join minutos m on m.minuto = f.minuto
      left join cron.job j on j.jobid = f.jobid
     -- 3 = v_rajada_min hoje em incident_settings; rajada vira um incidente so
     where m.jobs_no_minuto < 3
),
classificadas as (
    select a.*,
           -- o freio: orfao cuja falha ja passou de 30 min nao acorda ninguem
           (a.sem_cadastro and a.start_time < now() - interval '30 minutes') as orfao_morto,
           case
               when a.sem_cadastro and a.start_time < now() - interval '30 minutes' then 'baixa'
               when a.ok_24h = 0 and a.falhas_24h >= 3                              then 'alta'
               else 'media'
           end as sev_nova
      from avulsas a
)

select jsonb_pretty(jsonb_build_object(

    -- ── 1. o codigo novo esta no lugar ──────────────────────────────────────
    'codigo', jsonb_build_object(
        'ok_left_join_no_B2',
            (select prosrc ilike '%left join cron.job j on j.jobid = f.jobid%' from base),
        'ok_join_interno_sumiu',
            (select prosrc not ilike '%'||chr(10)||'          join cron.job j on j.jobid = f.jobid%' from base),
        'ok_nome_estavel_do_orfao',
            (select prosrc ilike '%coalesce(j.jobname, ''jobid-'' || f.jobid)%' from base),
        'ok_flag_sem_cadastro',
            (select prosrc ilike '%(j.jobid is null)%as sem_cadastro%' from base),
        -- sem isto o incidente resgatado chegaria mudo, com '(sem comando)'
        'ok_comando_vem_da_execucao',
            (select prosrc ilike '%coalesce(j.command,  f.command)%' from base),
        'ok_freio_orfao_morto',
            (select prosrc ilike '%v_orfao_morto := v_reg.sem_cadastro%' from base),
        'ok_freio_decide_severidade',
            (select prosrc ilike '%when v_orfao_morto%then ''baixa''%' from base),
        'ok_contador_no_retorno',
            (select prosrc ilike '%''cron_sem_cadastro'', v_orfaos%' from base),
        'ok_contexto_expoe_os_dois_flags',
            (select prosrc ilike '%''sem_cadastro_em_cron_job'', v_reg.sem_cadastro%'
                and prosrc ilike '%''orfao_ja_morto'', v_orfao_morto%' from base)),

    -- ── 2. `create or replace` troca TODOS os atributos ─────────────────────
    'privilegio', jsonb_build_object(
        'ok_security_definer',   (select prosecdef from base),
        'ok_search_path_fixo',   (select proconfig::text ilike '%search_path%' from base),
        'ok_anon_nao_executa',
            (select not has_function_privilege('anon', oid, 'EXECUTE') from base),
        'ok_authenticated_nao_executa',
            (select not has_function_privilege('authenticated', oid, 'EXECUTE') from base),
        'ok_service_role_executa',
            (select has_function_privilege('service_role', oid, 'EXECUTE') from base)),

    -- ── 3. replay de 7 dias: o que o criterio novo faz com o que era apagado ─
    'replay_7d', jsonb_build_object(
        'falhas_fora_de_rajada',        (select count(*) from classificadas),
        'ja_eram_vistas',               (select count(*) from classificadas where not sem_cadastro),
        'resgatadas_pelo_left_join',    (select count(*) from classificadas where sem_cadastro),
        'resgatadas_por_severidade', (
            select coalesce(jsonb_object_agg(sev_nova, n), '{}'::jsonb)
              from (select sev_nova, count(*) as n from classificadas
                     where sem_cadastro group by sev_nova) z),
        -- o ponto que interessa: resgatar nao pode virar barulho
        'ok_nenhuma_resgatada_toca_o_telefone',
            (select count(*) = 0 from classificadas
              where sem_cadastro and sev_nova in ('alta','critica')),
        'ok_freio_pegou_todas',
            (select count(*) = 0 from classificadas where sem_cadastro and not orfao_morto)),

    -- ── 4. o teto do catalogo nao reergue o orfao ───────────────────────────
    -- severidade efetiva = MAX(leitura da IA, piso do catalogo). De nada adianta
    -- o freio dizer `baixa` se o piso de `cron%` reerguer para alta.
    'teto_do_catalogo', jsonb_build_object(
        'efetiva_orfao_baixa',
            public.incident_severidade_efetiva('cron:jobid-22', 'baixa'),
        'ok_orfao_fica_no_painel',
            public.incident_severidade_efetiva('cron:jobid-22', 'baixa')
                not in ('alta','critica')),

    -- ── 5. a janela viva: rodar agora nao inventa incidente ─────────────────
    'janela_viva_2h', jsonb_build_object(
        'falhas_sem_cadastro_nas_ultimas_2h', (
            select count(*) from cron.job_run_details d
             where d.start_time >= now() - interval '2 hours'
               and d.status not in ('succeeded','running')
               and not exists (select 1 from cron.job j where j.jobid = d.jobid)),
        'observacao', 'orfao mais recente parou ha ~5h: a mudanca nao cria nada agora, so deixa de apagar quando acontecer'),

    'incidentes_cron_abertos_agora', (
        select coalesce(jsonb_agg(jsonb_build_object(
                'component', i.component, 'sev', i.ai_severity,
                'efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity))
            order by i.first_seen), '[]'::jsonb)
          from public.incidents i
         where i.status <> 'resolved' and i.component like 'cron%')
)) as relatorio;
