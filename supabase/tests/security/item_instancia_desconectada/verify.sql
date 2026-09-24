-- Verificacao da migration 20260924180000 (classe "instancia desconectada").
--
-- A pergunta que este arquivo responde: existe ALGUM caminho pelo qual uma
-- desconexao de instancia volte a chegar no telefone dele? Cada linha e um
-- caminho fechado.

with checagens as (

    -- 1. A coluna de teto existe e so aceita as 4 severidades (ou nulo).
    select 1 as n,
           'coluna severidade_teto existe' as o_que,
           (exists (
               select 1 from information_schema.columns
                where table_schema = 'public'
                  and table_name   = 'incident_component_catalog'
                  and column_name  = 'severidade_teto'
           )) as ok,
           '' as detalhe

    union all
    select 2,
           'constraint do teto ativa',
           exists (
               select 1 from pg_constraint
                where conname = 'incident_component_catalog_severidade_teto_check'
           ),
           ''

    -- 2. A classe esta cadastrada como baixa com teto baixa, nos dois provedores.
    union all
    select 3,
           'uazapi:instancia-desconectada = baixa/baixa',
           (select severidade_padrao = 'baixa' and severidade_teto = 'baixa' and is_active
              from public.incident_component_catalog
             where component = 'uazapi:instancia-desconectada'),
           coalesce((select severidade_padrao || '/' || coalesce(severidade_teto, 'sem teto')
                       from public.incident_component_catalog
                      where component = 'uazapi:instancia-desconectada'), 'NAO CADASTRADO')

    union all
    select 4,
           'meta:instancia-desconectada = baixa/baixa',
           (select severidade_padrao = 'baixa' and severidade_teto = 'baixa' and is_active
              from public.incident_component_catalog
             where component = 'meta:instancia-desconectada'),
           coalesce((select severidade_padrao || '/' || coalesce(severidade_teto, 'sem teto')
                       from public.incident_component_catalog
                      where component = 'meta:instancia-desconectada'), 'NAO CADASTRADO')

    -- 3. O TETO SEGURA. Este e o teste que importa: o analisador por IA roda a
    --    cada 2 min e pode reclassificar. Se ele gritar 'critica', a severidade
    --    efetiva tem que continuar 'baixa'.
    union all
    select 5,
           'IA dizendo critica nao escala a classe (uazapi)',
           public.incident_severidade_efetiva('uazapi:instancia-desconectada', 'critica') = 'baixa',
           public.incident_severidade_efetiva('uazapi:instancia-desconectada', 'critica')

    union all
    select 6,
           'IA dizendo alta nao escala a classe (meta)',
           public.incident_severidade_efetiva('meta:instancia-desconectada', 'alta') = 'baixa',
           public.incident_severidade_efetiva('meta:instancia-desconectada', 'alta')

    union all
    select 7,
           'sem opiniao da IA a classe e baixa',
           public.incident_severidade_efetiva('uazapi:instancia-desconectada', null) = 'baixa',
           public.incident_severidade_efetiva('uazapi:instancia-desconectada', null)

    -- 4. O teto e EXCECAO, nao regra nova: componente sem teto declarado
    --    continua deixando a IA escalar. Se esta linha falhar, o conserto virou
    --    mordaca geral.
    union all
    select 8,
           'componente sem teto continua escalando pela IA',
           public.incident_severidade_efetiva('evolution-send-message', 'critica') = 'critica',
           public.incident_severidade_efetiva('evolution-send-message', 'critica')

    union all
    select 9,
           'piso do catalogo continua valendo (IA baixa nao rebaixa alta)',
           public.incident_severidade_rank(
               public.incident_severidade_efetiva('evolution-send-message', 'baixa')
           ) >= public.incident_severidade_rank('alta'),
           public.incident_severidade_efetiva('evolution-send-message', 'baixa')

    -- 5. As duas funcoes nao ficaram callable por PUBLIC depois do
    --    drop/create (o `create function` reconcede EXECUTE a PUBLIC).
    union all
    select 10,
           'incident_component_info fechada para anon',
           not has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE'),
           ''

    union all
    select 11,
           'incident_severidade_efetiva fechada para anon',
           not has_function_privilege('anon', 'public.incident_severidade_efetiva(text, text)', 'EXECUTE'),
           ''

    union all
    select 12,
           'incident_component_info fechada para authenticated',
           not has_function_privilege('authenticated', 'public.incident_component_info(text)', 'EXECUTE'),
           ''

    union all
    select 13,
           'incident_severidade_efetiva fechada para authenticated',
           not has_function_privilege('authenticated', 'public.incident_severidade_efetiva(text, text)', 'EXECUTE'),
           ''

    -- 6. O fecho por borda existe, tem UMA sobrecarga so (a de 4 argumentos,
    --    aplicada por engano, tinha que sair) e nao e callable pelo front.
    union all
    select 14,
           'incident_resolver_edge existe com 1 sobrecarga',
           (select count(*) = 1
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'incident_resolver_edge'),
           (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'incident_resolver_edge')

    union all
    select 15,
           'incident_resolver_edge fechada para anon',
           not has_function_privilege('anon', 'public.incident_resolver_edge(text, text, text)', 'EXECUTE'),
           ''

    union all
    select 16,
           'incident_resolver_edge fechada para authenticated',
           not has_function_privilege('authenticated', 'public.incident_resolver_edge(text, text, text)', 'EXECUTE'),
           ''

    -- 7. Fechar e no-op quando nao ha incidente aberto daquela rota. Se esta
    --    linha falhar, a funcao esta fechando incidente de terceiros.
    union all
    select 17,
           'resolver rota inexistente nao fecha nada',
           public.incident_resolver_edge(
               'uazapi:instancia-desconectada',
               '00000000-0000-0000-0000-000000000000',
               'teste de verificacao'
           ) = 0,
           ''
)
select n,
       case when ok then 'ok' else 'FALHOU' end as resultado,
       o_que,
       detalhe
  from checagens
 order by n;
