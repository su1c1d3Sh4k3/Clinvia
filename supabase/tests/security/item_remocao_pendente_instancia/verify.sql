-- Remocao pendente de instancia (25/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O que este teste protege: a versao anterior de `uzapi-delete-instance` apagava
-- a nossa linha mesmo quando a UAZAPI recusava a remocao, e foi assim que
-- nasceram as 9 instancias orfas medidas no provedor. O estado "remocao
-- pendente" so vale se ele for VISIVEL — por isso as checagens abaixo cobrem a
-- coluna, o indice, o catalogo do incidente e o que o front consegue ler.

with
c1 as (
    select 1 as ord,
           'coluna removal_pending_at existe' as checagem,
           case when exists (
                    select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'instances'
                       and column_name = 'removal_pending_at'
                       and data_type = 'timestamp with time zone')
                then 'ok' else 'CONFERIR' end as status,
           '' as detalhe
),
c2 as (
    select 2, 'colunas de rastro da pendencia existem (erro + quem pediu)',
           case when (select count(*) from information_schema.columns
                       where table_schema = 'public' and table_name = 'instances'
                         and column_name in ('removal_error', 'removal_requested_by')) = 2
                then 'ok' else 'CONFERIR' end,
           ''
),
-- O comentario nao e enfeite: e o que impede a proxima pessoa de achar que a
-- linha pendente e lixo e limpar a tabela.
c3 as (
    select 3, 'comentario da coluna explica por que a linha NAO foi apagada',
           case when col_description('public.instances'::regclass,
                    (select attnum from pg_attribute
                      where attrelid = 'public.instances'::regclass
                        and attname = 'removal_pending_at')) ilike '%orfa invisivel%'
                  or col_description('public.instances'::regclass,
                    (select attnum from pg_attribute
                      where attrelid = 'public.instances'::regclass
                        and attname = 'removal_pending_at')) ilike '%órfã invisível%'
                then 'ok' else 'CONFERIR' end,
           ''
),
c4 as (
    select 4, 'indice parcial de pendencias existe',
           case when exists (
                    select 1 from pg_indexes
                     where schemaname = 'public' and tablename = 'instances'
                       and indexname = 'idx_instances_removal_pending')
                then 'ok' else 'CONFERIR' end,
           ''
),
-- O incidente tem que sair do painel: sem alguem concluir, a pendencia nunca se
-- resolve sozinha. `somente_painel = true` aqui seria mordaca.
c5 as (
    select 5, 'componente uazapi:remocao-pendente catalogado e NAO e somente_painel',
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'uazapi:remocao-pendente'
                       and is_active and not somente_painel
                       and severidade_padrao = 'media')
                then 'ok' else 'CONFERIR' end,
           coalesce((select severidade_padrao || case when somente_painel then ' | PAINEL' else '' end
                       from public.incident_component_catalog
                      where component = 'uazapi:remocao-pendente'), 'sem linha')
),
-- O front precisa ENXERGAR a pendencia; o motivo cru do provedor, nao.
c6 as (
    select 6, 'authenticated le removal_pending_at',
           case when has_column_privilege('authenticated', 'public.instances', 'removal_pending_at', 'SELECT')
                then 'ok' else 'CONFERIR' end,
           ''
),
-- Medicao, nao veredito: quantas pendencias estao abertas agora.
c7 as (
    select 7, 'pendencias abertas hoje',
           'ok',
           count(*)::text || ' instancia(s)'
               || coalesce(' — mais antiga ' || to_char(min(removal_pending_at) at time zone 'America/Sao_Paulo',
                                                        'DD/MM HH24:MI'), '')
      from public.instances
     where removal_pending_at is not null
)
select checagem, status, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7
) t order by ord, checagem;
