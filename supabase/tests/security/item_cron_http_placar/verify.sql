-- Estado DEPOIS de 20260923440000 (placar do bloco A / cron-http).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_cron_http_placar/verify.sql
--
-- Cada linha de `itens` e uma afirmacao: `ok` false em qualquer uma reprova.
-- `retro_7_dias` nao e afirmacao, e a medida do ruido que sai.

with src as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cron_health_scan'
),
checagens(item, ok, observado) as (
    values
    ('cron_http_calls passou a guardar o desfecho',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='cron_http_calls'
                and column_name in ('status_code','checked_at')
              having count(*) = 2),
     'colunas status_code + checked_at'),

    ('o desfecho e carimbado antes da poda de 30 min',
     (select prosrc from src) ilike '%update public.cron_http_calls c%set status_code = coalesce(r.status_code, -1)%',
     'UPDATE ... from net._http_response'),

    ('retencao da tabela cobre a janela de 24h',
     (select prosrc from src) ilike '%cron_http_calls where created_at < now() - interval ''26 hours''%',
     '26 horas'),

    ('indice do placar existe',
     exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_cron_http_calls_alvo_created'),
     'idx_cron_http_calls_alvo_created'),

    -- o defeito medido em 23/09 18:45: severidade so pelo codigo HTTP
    ('a severidade do bloco A deixou de sair so do codigo HTTP',
     (select prosrc from src) not ilike '%v_sev := case
                     when v_reg.status_code in (401, 403) then ''critica''
                     when v_reg.status_code >= 500        then ''alta''%',
     'prosrc de cron_health_scan'),

    ('pane = nenhuma resposta ok em 24h com 3+ falhas',
     (select prosrc from src) ilike '%v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3%',
     'criterio de alta no bloco A'),

    ('502 isolado com o alvo respondendo ok nasce baixa',
     (select prosrc from src) ilike '%v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0%',
     'criterio de tropeco no bloco A'),

    ('401/403 seguem criticos e nenhum placar os rebaixa',
     (select prosrc from src) ilike '%when v_reg.status_code in (401, 403)              then ''critica''%',
     'chave errada nao melhora sozinha'),

    ('o placar vai escrito no incidente, nao so no codigo',
     (select prosrc from src) ilike '%v_http_placar%'
     and (select prosrc from src) ilike '%severidade_pelo_placar%',
     'error_description + context'),

    -- Sem isto tudo acima seria decorativo: incident_severidade_efetiva toma o
    -- MAIOR entre a leitura e o piso do catalogo.
    ('piso do catalogo para cron-http: caiu para media',
     (select severidade_padrao = 'media' from public.incident_component_catalog
       where component = 'cron-http:' and match_tipo = 'prefixo'),
     (select 'cron-http: = ' || severidade_padrao from public.incident_component_catalog
       where component = 'cron-http:' and match_tipo = 'prefixo')),

    ('502 isolado NAO vai mais ao telefone',
     public.incident_severidade_efetiva('cron-http:delivery-automation-worker', 'baixa')
         not in ('critica','alta'),
     'efetiva(cron-http:delivery-automation-worker, baixa) = '
       || public.incident_severidade_efetiva('cron-http:delivery-automation-worker', 'baixa')),

    ('pane de alvo HTTP continua indo ao telefone',
     public.incident_severidade_efetiva('cron-http:delivery-automation-worker', 'alta') = 'alta',
     'efetiva(..., alta)'),

    ('401 de alvo HTTP continua critico',
     public.incident_severidade_efetiva('cron-http:alert-notify', 'critica') = 'critica',
     'o caso alert-notify nao foi afrouxado'),

    ('o componente de teste continua so no painel',
     public.incident_severidade_efetiva('zz-teste:cron-http-placar', 'critica')
         not in ('critica','alta')
     or exists (select 1 from public.incident_component_catalog
                 where component = 'zz-teste:' and somente_painel),
     'zz-teste: e somente_painel'),

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
     'prosecdef+proconfig'),

    ('o left join do bloco B2 sobreviveu a esta migration',
     (select prosrc from src) ilike '%left join cron.job j on j.jobid = d.jobid%',
     '20260923430000 nao foi desfeito'),

    ('o vigia continua agendado a cada 5 min',
     exists (select 1 from cron.job where jobname = 'cron-health-watch' and active),
     'cron.job cron-health-watch')
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens),

    -- Ruido: o que os ultimos 7 dias teriam produzido no telefone, antes e depois.
    --
    -- A severidade GRAVADA nao muda retroativamente — ela foi escrita pelo
    -- criterio velho e fica como registro historico. O que a coluna
    -- `se_reavaliado_hoje` faz e recontar o caso com o placar de hoje, a partir
    -- do que ficou escrito no proprio evento. Sem essa distincao a conta diria
    -- "2 antes, 2 depois" e nao mediria nada.
    'retro_7_dias', (
        with i as (
            select x.component, x.event_count, x.ai_severity, x.first_seen,
                   (select e.context from public.incident_events e
                     where e.incident_id = x.id order by e.received_at desc limit 1) as ctx,
                   (select e.http_code from public.incident_events e
                     where e.incident_id = x.id order by e.received_at desc limit 1) as code
              from public.incidents x
             where x.component like 'cron-http:%'
               and x.first_seen > now() - interval '7 days'
        ),
        r as (
            select i.*,
                   case when i.code in (401, 403) then 'critica'
                        -- evento antigo nao tem placar no context; 1 evento
                        -- unico e, por definicao, falha isolada
                        when i.ctx ? 'severidade_pelo_placar'
                             then i.ctx ->> 'severidade_pelo_placar'
                        when i.event_count = 1 then 'baixa'
                        else 'media' end as sev_nova
              from i
        )
        select jsonb_build_object(
            'incidentes_cron_http', (select count(*) from r),
            'telefone_criterio_antigo', (select count(*) from r),  -- piso era alta: todos tocavam
            'telefone_criterio_novo', (select count(*) from r
                where public.incident_severidade_efetiva(component, sev_nova) in ('critica','alta')),
            'detalhe', (select coalesce(jsonb_agg(jsonb_build_object(
                'component', component, 'eventos', event_count,
                'severidade_gravada', ai_severity,
                'se_reavaliado_hoje', sev_nova,
                'efetiva_se_reavaliado', public.incident_severidade_efetiva(component, sev_nova)
            ) order by first_seen desc), '[]'::jsonb) from r))
    )
));
