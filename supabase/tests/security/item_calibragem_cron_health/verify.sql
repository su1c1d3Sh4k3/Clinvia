-- Estado DEPOIS de 20260923420000 (calibragem do cron-health-watch).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_calibragem_cron_health/verify.sql
--
-- Cada linha e uma afirmacao: `ok` false em qualquer uma reprova o item.
-- Os blocos `retro_7_dias` e `cegueira_conhecida` nao sao afirmacoes: um mede o
-- efeito, o outro nomeia o achado que ficou de fora e espera aval.

with src as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cron_health_scan'
),
cfg as (select * from public.llm_platform_settings limit 1),
checagens(item, ok, observado) as (
    values
    ('limiar de rajada existe como chave editavel',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='llm_platform_settings'
                and column_name='cron_health_rajada_jobs'),
     'llm_platform_settings.cron_health_rajada_jobs'),

    ('limiar em vigor e 3 jobs no mesmo minuto',
     (select cron_health_rajada_jobs = 3 from cfg),
     (select 'rajada_jobs=' || cron_health_rajada_jobs from cfg)),

    -- O defeito que este item fecha: severidade fixa ignorando o placar
    ('a severidade do bloco de falha deixou de ser fixa',
     (select prosrc from src) not ilike '%v_cron_erros := v_cron_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> ''incident_id'')::uuid, ''alta'')%',
     'prosrc de cron_health_scan'),

    ('o placar de 24h entrou no criterio',
     (select prosrc from src) ilike '%v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3%',
     'pane = nenhum sucesso em 24h com 3+ tentativas'),

    ('falha isolada com o job de volta ao ar nasce baixa',
     (select prosrc from src) ilike '%v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0%'
     and (select prosrc from src) ilike '%v_reg.status_mais_recente = ''succeeded''  then ''baixa''%',
     'criterio de tropeco'),

    ('rajada vira um incidente de infraestrutura, nao N de job',
     (select prosrc from src) ilike '%cron-infra:rajada%'
     and (select prosrc from src) ilike '%where m.jobs_no_minuto < v_rajada_min%',
     'bloco B1 + exclusao no bloco B2'),

    ('rajada repetida na janela escala para alta',
     (select prosrc from src) ilike '%case when v_rajadas_jan >= 2 then ''alta'' else ''media'' end%',
     'um minuto = tropeco; dois ou mais = degradacao'),

    ('rajada e idempotente por minuto',
     (select prosrc from src) ilike '%''cronburst:'' || to_char(v_reg.minuto%',
     'request_id da rajada'),

    ('escalada posterior usa o piso, que so sobe',
     (select prosrc from src) ilike '%incident_piso_severidade((v_res ->> ''incident_id'')::uuid, v_sev)%',
     'tropeco que vira pane sobe sem rebaixar nada'),

    -- Sem isto o criterio acima seria decorativo: o teto de severidade
    -- (20260923400000) toma o MAIOR entre leitura e piso do catalogo.
    ('piso do catalogo para cron: caiu para media',
     (select severidade_padrao = 'media' from public.incident_component_catalog
       where component = 'cron:'),
     (select 'cron: = ' || severidade_padrao from public.incident_component_catalog
       where component = 'cron:')),

    ('catalogo conhece o componente de rajada',
     exists (select 1 from public.incident_component_catalog
              where component = 'cron-infra:' and match_tipo = 'prefixo'
                and severidade_padrao = 'media' and is_active),
     'incident_component_catalog.cron-infra:'),

    ('uma falha isolada de job saudavel nao vai mais ao telefone',
     public.incident_severidade_efetiva('cron:campaign-dispatch-worker', 'baixa')
         not in ('critica', 'alta'),
     'efetiva(cron:campaign-dispatch-worker, baixa) = '
       || public.incident_severidade_efetiva('cron:campaign-dispatch-worker', 'baixa')),

    ('pane de job continua indo ao telefone',
     public.incident_severidade_efetiva('cron:campaign-dispatch-worker', 'alta') = 'alta',
     'efetiva(cron:..., alta)'),

    ('job PARADO continua critica',
     public.incident_severidade_efetiva('cron:qualquer-um', 'critica') = 'critica',
     'bloco C nao mudou'),

    ('rajada isolada fica no painel, rajada repetida toca',
     public.incident_severidade_efetiva('cron-infra:rajada', 'media') = 'media'
     and public.incident_severidade_efetiva('cron-infra:rajada', 'alta') = 'alta',
     'efetiva de cron-infra:rajada'),

    ('os 9 falsos positivos de 23/09 foram fechados com motivo escrito',
     not exists (select 1 from public.incidents
                  where status <> 'resolved' and component like 'cron:%'
                    and first_seen >= '2026-09-23T14:00:00Z'
                    and first_seen <  '2026-09-23T16:00:00Z'),
     (select count(*)::text || ' fechados'
        from public.incidents
       where status = 'resolved' and component like 'cron:%'
         and notes ilike '%20260923420000%')),

    ('nenhum incidente cron REAL foi fechado junto',
     not exists (select 1 from public.incidents
                  where notes ilike '%20260923420000%' and event_count > 1),
     'so event_count = 1 entrou no fechamento'),

    ('varredor NAO e chamavel por anon',
     not has_function_privilege('anon','public.cron_health_scan(integer)','EXECUTE'),
     'has_function_privilege(anon, cron_health_scan)'),

    ('varredor NAO e chamavel por authenticated',
     not has_function_privilege('authenticated','public.cron_health_scan(integer)','EXECUTE'),
     'has_function_privilege(authenticated, cron_health_scan)'),

    ('service_role executa o varredor',
     has_function_privilege('service_role','public.cron_health_scan(integer)','EXECUTE'),
     'has_function_privilege(service_role, cron_health_scan)'),

    ('varredor continua security definer com search_path fixo',
     (select p.prosecdef and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='cron_health_scan'),
     'prosecdef+proconfig de cron_health_scan'),

    ('o vigia continua agendado a cada 5 min',
     exists (select 1 from cron.job where jobname = 'cron-health-watch' and active),
     'cron.job cron-health-watch')
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens),

    -- Quanto ruido some, medido nos ultimos 7 dias de execucoes reais
    'retro_7_dias', (
        -- `visivel` reproduz o `join cron.job` do bloco B: sem isso a conta
        -- credita ao criterio novo jobs que o varredor NUNCA enxergou (jobid 22
        -- sozinho responde por 39 falhas/24h) e o ganho aparece menor do que e.
        with falhas as (
            select d.jobid, d.runid, d.start_time as quando,
                   date_trunc('minute', d.start_time) as minuto,
                   exists (select 1 from cron.job j where j.jobid = d.jobid) as visivel
              from cron.job_run_details d
             where d.start_time > now() - interval '7 days'
               and d.status not in ('succeeded','running')
        ),
        minutos as (select minuto, count(distinct jobid) as jobs from falhas group by minuto),
        rajadas as (
            select m.minuto,
                   (select count(*) from minutos m2
                     where m2.jobs >= 3
                       and m2.minuto between m.minuto - interval '2 hours' and m.minuto) as na_janela
              from minutos m where m.jobs >= 3
        ),
        -- severidade que cada falha AVULSA receberia pelo criterio novo
        avulsas as (
            select f.*,
                   (select count(*) from cron.job_run_details x
                     where x.jobid = f.jobid
                       and x.start_time between f.quando - interval '24 hours' and f.quando
                       and x.status = 'succeeded') as ok_24h,
                   (select count(*) from cron.job_run_details x
                     where x.jobid = f.jobid
                       and x.start_time between f.quando - interval '24 hours' and f.quando
                       and x.status not in ('succeeded','running')) as falhas_24h
              from falhas f join minutos m on m.minuto = f.minuto
             where m.jobs < 3
        )
        select jsonb_build_object(
            'falhas_de_execucao', (select count(*) from falhas),
            'falhas_que_o_varredor_ENXERGA', (select count(*) from falhas where visivel),
            'falhas_cegas_rls_cron_job', (select count(*) from falhas where not visivel),
            'incidentes_criterio_antigo', (select count(*) from falhas where visivel),
            'alertas_no_telefone_criterio_antigo', (select count(*) from falhas where visivel),
            'minutos_de_rajada', (select count(*) from minutos where jobs >= 3),
            'falhas_absorvidas_pela_rajada',
                (select count(*) from falhas f join minutos m on m.minuto = f.minuto
                  where m.jobs >= 3 and f.visivel),
            'incidentes_criterio_novo',
                (select count(*) from avulsas where visivel) + (select count(*) from minutos where jobs >= 3),
            -- so `alta` e `critica` saem do painel
            'alertas_no_telefone_criterio_novo',
                (select count(*) from avulsas where visivel and ok_24h = 0 and falhas_24h >= 3)
              + (select count(*) from rajadas where na_janela >= 2),
            'rajadas_que_tocam', (select count(*) from rajadas where na_janela >= 2),
            'observacao', 'rajada isolada fica em media (painel); rajada repetida em 2h vira alta; avulsa so vira alta se nada rodou em 24h')
    ),

    -- NAO corrigido de proposito: revelar estes tres abre alerta real no ato
    'cegueira_conhecida', (
        select jsonb_build_object(
            'motivo', 'cron.job tem RLS (username = CURRENT_USER); job de outro dono some do join do bloco B',
            'jobs', coalesce(jsonb_agg(jsonb_build_object(
                        'jobid', s.jobid, 'falhas_24h', s.falhas, 'ok_24h', s.ok,
                        'comando', s.cmd) order by s.falhas desc), '[]'::jsonb))
          from (
            select d.jobid,
                   count(*) filter (where d.status not in ('succeeded','running')) as falhas,
                   count(*) filter (where d.status = 'succeeded')                  as ok,
                   left(coalesce(max(d.command), ''), 100)                         as cmd
              from cron.job_run_details d
             where d.start_time > now() - interval '24 hours'
               and not exists (select 1 from cron.job j where j.jobid = d.jobid)
             group by d.jobid
            having count(*) filter (where d.status not in ('succeeded','running')) > 0) s
    )
));
