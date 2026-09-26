-- Teste de acesso / regressao: instancias UAZAPI marcadas como removidas
--
-- O que este verify protege, em ordem de gravidade:
--   1. que conversa e historico das instancias marcadas CONTINUAM legiveis --
--      a ordem foi "marque como removidas, NAO apague em cascata", e o jeito
--      mais facil de errar aqui e transformar a marca em delete;
--   2. que nao sobrou instancia UAZAPI viva dizendo-se desconectada, que e o
--      que fazia o banner vermelho acusar para sempre na tela da clinica;
--   3. que a guarda `removed_at IS NULL` continua DENTRO de
--      `admin_get_dashboard_metrics`. Ela ja foi apagada em silencio tres
--      vezes neste projeto por uma reemissao escrita a partir de migration
--      velha: `create or replace` troca o corpo inteiro e nada falha.
--
-- Um unico `select` porque `supabase db query --file` so imprime o resultado
-- do ULTIMO statement.

set lock_timeout = '5s';
set statement_timeout = '120s';

with
c1 as (
    select 1 as ord,
           'coluna removed_at existe' as checagem,
           case when count(*) = 2 then 'ok' else 'CONFERIR' end as status,
           count(*)::text || ' de 2 colunas' as detalhe
      from information_schema.columns
     where table_schema = 'public' and table_name = 'instances'
       and column_name in ('removed_at', 'removed_reason')
),
c2 as (
    select 2,
           'nenhuma instancia UAZAPI viva',
           case when count(*) = 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' linha(s) UAZAPI sem removed_at'
      from public.instances
     where coalesce(provider, 'uazapi') <> 'meta'
       and removed_at is null
),
c3 as (
    select 3,
           'as removidas tem motivo escrito',
           case when count(*) filter (where coalesce(removed_reason, '') = '') = 0
                then 'ok' else 'CONFERIR' end,
           count(*)::text || ' removida(s), '
               || count(*) filter (where coalesce(removed_reason, '') = '')::text
               || ' sem motivo'
      from public.instances
     where removed_at is not null
),
-- O CORACAO do teste: a linha morta continua servindo de ancora para a
-- conversa viva. Se alguem trocar a marca por um delete, isto vira zero.
c4 as (
    select 4,
           'conversas das removidas preservadas',
           case when count(*) > 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' conversa(s) ainda apontando para instancia removida'
      from public.conversations c
      join public.instances i on i.id = c.instance_id
     where i.removed_at is not null
),
c5 as (
    select 5,
           'historico arquivado preservado',
           case when count(*) > 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' conversa(s) removida(s) com messages_history'
      from public.conversations c
      join public.instances i on i.id = c.instance_id
     where i.removed_at is not null
       and c.messages_history is not null
       and jsonb_array_length(c.messages_history) > 0
),
c6 as (
    select 6,
           'nenhum incidente uazapi aberto',
           case when count(*) = 0 then 'ok' else 'CONFERIR' end,
           coalesce(string_agg(distinct component, ', '), 'nenhum')
      from public.incidents
     where component like 'uazapi:%' and status <> 'resolved'
),
-- Catraca contra a quarta reemissao silenciosa.
c7 as (
    select 7,
           'admin_get_dashboard_metrics filtra removidas',
           case when (select count(*)
                        from regexp_matches(pg_get_functiondef(p.oid),
                                            'removed_at IS NULL', 'g')) = 2
                then 'ok' else 'CONFERIR' end,
           (select count(*)
              from regexp_matches(pg_get_functiondef(p.oid),
                                  'removed_at IS NULL', 'g'))::text
               || ' de 2 guardas no corpo'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_get_dashboard_metrics'
),
-- O detector de varredura cega NAO pode ter sido desarmado junto: ele e o
-- unico aviso no dia em que perdermos a visao do provedor de novo.
c8 as (
    select 8,
           'detector de varredura cega segue armado',
           case when count(*) = 1 then 'ok' else 'CONFERIR' end,
           coalesce(max(severidade_padrao || ' ativo=' || is_active::text), 'sem linha')
      from public.incident_component_catalog
     where component = 'uazapi:varredura-cega' and is_active
)
select checagem, status, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5
    union all select * from c6 union all select * from c7
    union all select * from c8
) t order by ord;
