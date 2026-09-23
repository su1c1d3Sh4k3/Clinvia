-- Teste de acesso do analisador de incidentes.
--
-- Cobre 20260923290000 (catalogo de componentes) e 20260923300000 (cron +
-- medicao de custo). Roda como uma consulta so porque a CLI devolve apenas o
-- ultimo resultado.
--
-- Criterio: coluna `ok` = true em TODAS as linhas.

with checagens as (
    -- ── catalogo de componentes ──────────────────────────────────────────────
    select 'catalogo: anon nao le a tabela' as item,
           has_table_privilege('anon', 'public.incident_component_catalog', 'SELECT') = false as ok
    union all
    select 'catalogo: authenticated nao le a tabela',
           has_table_privilege('authenticated', 'public.incident_component_catalog', 'SELECT') = false
    union all
    select 'catalogo: anon nao escreve',
           has_table_privilege('anon', 'public.incident_component_catalog', 'INSERT') = false
           and has_table_privilege('anon', 'public.incident_component_catalog', 'UPDATE') = false
           and has_table_privilege('anon', 'public.incident_component_catalog', 'TRUNCATE') = false
    union all
    select 'catalogo: authenticated nao escreve',
           has_table_privilege('authenticated', 'public.incident_component_catalog', 'INSERT') = false
           and has_table_privilege('authenticated', 'public.incident_component_catalog', 'UPDATE') = false
           and has_table_privilege('authenticated', 'public.incident_component_catalog', 'TRUNCATE') = false
    union all
    select 'catalogo: RLS ligada',
           (select relrowsecurity from pg_class where oid = 'public.incident_component_catalog'::regclass)
    union all
    -- o PUBLIC herdado do `create function` e o erro que ja passou batido duas vezes
    select 'RPC info: PUBLIC/anon/authenticated sem EXECUTE',
           has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE') = false
           and has_function_privilege('authenticated', 'public.incident_component_info(text)', 'EXECUTE') = false
    union all
    select 'RPC info: service_role com EXECUTE',
           has_function_privilege('service_role', 'public.incident_component_info(text)', 'EXECUTE')
    union all
    select 'RPC info: exato vence prefixo',
           (select i.natureza from public.incident_component_info('openai:daily_anomaly') i) = 'detector'
    union all
    select 'RPC info: prefixo pega componente novo da familia',
           (select i.component from public.incident_component_info('cron:nunca-visto') i) = 'cron:'
    union all
    select 'RPC info: desconhecido nao inventa linha',
           not exists (select 1 from public.incident_component_info('componente-inexistente-xyz'))
    union all
    select 'catalogo: detector marcado como detector',
           (select count(*) from public.incident_component_catalog
             where natureza = 'detector' and component like 'openai:%') >= 5

    -- ── cron e medicao ───────────────────────────────────────────────────────
    union all
    select 'colunas de custo existem',
           (select count(*) from information_schema.columns
             where table_schema = 'public' and table_name = 'incidents'
               and column_name in ('ai_tokens', 'ai_cost_usd')) = 2
    union all
    select 'pending_count: anon/authenticated sem EXECUTE',
           has_function_privilege('anon', 'public.incident_analyze_pending_count()', 'EXECUTE') = false
           and has_function_privilege('authenticated', 'public.incident_analyze_pending_count()', 'EXECUTE') = false
    union all
    select 'invoke: anon/authenticated sem EXECUTE',
           has_function_privilege('anon', 'public.invoke_incident_analyze()', 'EXECUTE') = false
           and has_function_privilege('authenticated', 'public.invoke_incident_analyze()', 'EXECUTE') = false
    union all
    select 'finish_analysis: anon/authenticated sem EXECUTE',
           has_function_privilege('anon', 'public.incident_finish_analysis(uuid, jsonb)', 'EXECUTE') = false
           and has_function_privilege('authenticated', 'public.incident_finish_analysis(uuid, jsonb)', 'EXECUTE') = false
    union all
    select 'cron agendado de 2 em 2 min',
           (select schedule from cron.job where jobname = 'incident-analyze-scan') = '*/2 * * * *'
    union all
    select 'cron ativo',
           coalesce((select active from cron.job where jobname = 'incident-analyze-scan'), false)
    union all
    -- o invocador precisa pegar a chave NOVA: o vault ainda guarda o JWT legado
    -- em SUPABASE_SERVICE_ROLE_KEY e a function compara com o proprio env.
    select 'invocador le SUPABASE_EDGE_SECRET_KEY',
           (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'invoke_incident_analyze')
           like '%SUPABASE_EDGE_SECRET_KEY%'
    union all
    select 'invocador dispara por clinvia_http_post (rastro nomeado)',
           (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'invoke_incident_analyze')
           like '%clinvia_http_post%'
    union all
    select 'segredo da chave nova existe no vault',
           exists (select 1 from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY')
    union all
    -- sem preco cadastrado o custo fica nulo e a medicao some em silencio
    select 'preco do modelo padrao cadastrado',
           exists (select 1 from public.llm_model_prices where model = 'gpt-4.1-mini')
)
select item,
       ok,
       case when ok then 'ok' else 'FALHOU' end as veredito
  from checagens
 order by ok, item;
