-- Estado DEPOIS de 20260923410000 (patamares de custo).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_patamares_de_custo/verify.sql
--
-- Cada linha e uma afirmacao: `ok` false em qualquer uma reprova o item.
-- O bloco `retro_30_dias` nao e afirmacao, e a contagem que justificou os numeros.

with cfg as (select * from public.llm_platform_settings limit 1),
src as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'openai_alert_scan'
),
checagens(item, ok, observado) as (
    values
    ('patamar critico existe como chave editavel',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='llm_platform_settings'
                and column_name='daily_anomaly_critical_usd'),
     'llm_platform_settings.daily_anomaly_critical_usd'),

    ('minimo de dias existe como chave editavel',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='llm_platform_settings'
                and column_name='daily_anomaly_min_days'),
     'llm_platform_settings.daily_anomaly_min_days'),

    ('valores em vigor sao os combinados (10 / 60 / 3x / 5 dias)',
     (select daily_anomaly_min_usd = 10.00
         and daily_anomaly_critical_usd = 60.00
         and daily_anomaly_factor = 3
         and daily_anomaly_min_days = 5 from cfg),
     (select 'piso=' || daily_anomaly_min_usd || ' critico=' || daily_anomaly_critical_usd
          || ' fator=' || daily_anomaly_factor || ' min_dias=' || daily_anomaly_min_days
        from cfg)),

    -- O defeito que este item fecha: `greatest` era um OU disfarcado
    ('o greatest saiu do criterio de anomalia',
     (select prosrc from src) not ilike '%usd_hoje >= greatest(%',
     'prosrc de openai_alert_scan'),

    ('as duas condicoes sao simultaneas (E, nao OU)',
     (select prosrc from src) ilike '%daily_anomaly_min_usd, 10.00)%'
     and (select prosrc from src) ilike '%and r.usd_hoje >= coalesce(v_cfg.daily_anomaly_factor%',
     'prosrc de openai_alert_scan'),

    ('historico curto cala o detector',
     (select prosrc from src) ilike '%continue when r.dias_base < coalesce(v_cfg.daily_anomaly_min_days%',
     'prosrc de openai_alert_scan'),

    ('patamar critico e absoluto, nao depende da media',
     (select prosrc from src) ilike '%usd_hoje >= coalesce(v_cfg.daily_anomaly_critical_usd%',
     'prosrc de openai_alert_scan'),

    ('a severidade entra no dedupe (critico passa depois do aviso)',
     (select prosrc from src) ilike '%|| v_hoje::text || ''|'' || v_sev%',
     'dedupe_key de daily_anomaly'),

    ('varredor NAO e chamavel por anon',
     not has_function_privilege('anon','public.openai_alert_scan()','EXECUTE'),
     'has_function_privilege(anon, openai_alert_scan)'),

    ('varredor NAO e chamavel por authenticated',
     not has_function_privilege('authenticated','public.openai_alert_scan()','EXECUTE'),
     'has_function_privilege(authenticated, openai_alert_scan)'),

    ('service_role executa o varredor',
     has_function_privilege('service_role','public.openai_alert_scan()','EXECUTE'),
     'has_function_privilege(service_role, openai_alert_scan)'),

    ('varredor continua security definer com search_path fixo',
     (select p.prosecdef and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='openai_alert_scan'),
     'prosecdef+proconfig de openai_alert_scan'),

    ('o falso positivo de 23/09 nao passaria hoje',
     -- PELE: US$ 3,34 com media de UM dia. Reprova nas duas portas novas.
     not (3.34 >= (select daily_anomaly_min_usd from cfg))
     and 1 < (select daily_anomaly_min_days from cfg),
     'US$ 3,34 com 1 dia de base'),

    ('alerta de custo continua sendo AVISO, nunca corte',
     (select prosrc from src) not ilike '%update public.profiles%'
     and (select prosrc from src) not ilike '%ia_on%',
     'openai_alert_scan nao desliga nada')
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens),
    -- Contagem retroativa. A fonte certa (openai_project_costs_daily) tem 2
    -- dias, porque os projetos por conta nasceram em 22/09; a unica serie de 30
    -- dias e `token_usage_log`, cujo cost_usd embute a margem e portanto
    -- SUPERESTIMA. Na pratica o criterio novo disparara igual ou menos.
    'retro_30_dias', (
        with dias as (
            select t.owner_id, (t.created_at at time zone 'America/Sao_Paulo')::date as day,
                   sum(t.cost_usd) as usd
              from public.token_usage_log t
             where t.created_at >= now() - interval '40 days'
             group by 1, 2
        ),
        janela as (
            select d.owner_id, d.day, d.usd,
                   coalesce((select avg(b.usd) from dias b
                     where b.owner_id = d.owner_id
                       and b.day between d.day - 7 and d.day - 1), 0) as m,
                   (select count(*) from dias b
                     where b.owner_id = d.owner_id
                       and b.day between d.day - 7 and d.day - 1)     as dias_base
              from dias d
             where d.day >= (now() at time zone 'America/Sao_Paulo')::date - 30
               and d.day <  (now() at time zone 'America/Sao_Paulo')::date
        ),
        marcado as (
            select j.*,
                   (j.usd >= greatest(3.00, 3 * j.m))                          as atual,
                   (j.dias_base >= 5 and j.usd >= 10 and j.usd >= 3 * j.m)     as novo
              from janela j
        )
        select jsonb_build_object(
            'fonte', 'token_usage_log (proxy; superestima porque cost_usd tem margem)',
            'de', (select min(day) from marcado),
            'ate', (select max(day) from marcado),
            'dias_conta_avaliados', (select count(*) from marcado),
            'criterio_atual', (select count(*) from marcado where atual),
            'criterio_novo',  (select count(*) from marcado where novo),
            'cortados',       (select count(*) from marcado where atual and not novo),
            'so_no_novo',     (select count(*) from marcado where novo and not atual),
            'seriam_criticos',(select count(*) from marcado where novo and usd >= 60))
    ),
    'dias_de_historico_na_fonte_certa', (
        select jsonb_build_object(
            'openai_project_costs_daily', (select count(distinct day)
                                             from public.openai_project_costs_daily),
            'observacao', 'abaixo de 5 dias o detector se cala por desenho')
    )
));
