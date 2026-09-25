-- Recebimento duravel: mensagem entregue pela Meta que nao vira conversa
-- (25/09/2026). Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.

with
-- 1-2. As duas familias existem, ativas, criticas e SEM somente_painel. A
--      condicao 3 dele ("alerta no primeiro caso, nao no decimo") e satisfeita
--      por estas duas colunas e por mais nada: o claim manda a primeira
--      ocorrencia como individual, e `alert-notify` tira critica da rajada.
c1 as (
    select 1 as ord,
           'recebimento:perdida- e critica, prefixo e nao somente_painel' as checagem,
           case when severidade_padrao = 'critica' and somente_painel = false
                 and is_active and match_tipo = 'prefixo'
                then 'ok' else 'FALHOU' end as resultado,
           severidade_padrao || ' / painel=' || somente_painel::text as detalhe
      from public.incident_component_catalog
     where component = 'recebimento:perdida-'
),
c2 as (
    select 2, 'recebimento:nao-gravado e critica, exato e nao somente_painel',
           case when severidade_padrao = 'critica' and somente_painel = false
                 and is_active and match_tipo = 'exato'
                then 'ok' else 'FALHOU' end,
           severidade_padrao || ' / painel=' || somente_painel::text
      from public.incident_component_catalog
     where component = 'recebimento:nao-gravado'
),
-- 3-4. O componente REAL que o `webhook-handle-message` escreve resolve para a
--      familia certa. Sem isto o piso critico nao se aplica e a gravidade fica
--      inteiramente nas maos da IA.
c3 as (
    select 3, 'componente real sem-conversa resolve para a familia perdida',
           case when component = 'recebimento:perdida-' and severidade_padrao = 'critica'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('recebimento:perdida-sem-conversa (pele-10)')
),
c4 as (
    select 4, 'componente real sem-contato resolve para a familia perdida',
           case when component = 'recebimento:perdida-' and severidade_padrao = 'critica'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('recebimento:perdida-sem-contato (meta-488512407686498)')
),
-- 5. Nenhum teto: seria a unica coisa capaz de rebaixar isto de critica, e
--    mensagem de paciente perdida nunca deve ser rebaixada.
c5 as (
    select 5, 'nenhuma das duas familias tem teto de gravidade',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           count(*)::text || ' com teto'
      from public.incident_component_catalog
     where component in ('recebimento:perdida-', 'recebimento:nao-gravado')
       and severidade_teto is not null
),
-- 6. A identidade do corpo bruto. Sem o indice UNICO a reentrega da Meta vira
--    segunda linha na fila, e a fila passa a ser fonte de duplicata em vez de
--    rede de seguranca.
c6 as (
    select 6, 'webhook_queue.body_sha256 tem indice unico parcial',
           case when count(*) = 1 then 'ok' else 'FALHOU' end,
           coalesce(max(indexdef), '(ausente)')
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'webhook_queue'
       and indexname = 'idx_webhook_queue_body_sha256'
       and indexdef ilike '%UNIQUE%'
       and indexdef ilike '%body_sha256 IS NOT NULL%'
),
-- 7-8. A tarefa que NUNCA existiu. Ate 25/09/2026 o unico invocador do
--       `webhook-queue-processor` era o receiver da UAZAPI: linha deixada em
--       `pending` so era drenada quando o proximo webhook da UAZAPI chegasse.
--       Sem trafego UAZAPI, a retentativa nunca acontecia.
c7 as (
    select 7, 'cron webhook-queue-drain existe, ativo, a cada minuto',
           case when count(*) = 1 then 'ok' else 'FALHOU' end,
           coalesce(max(schedule), '(ausente)') || ' / ativo=' ||
           coalesce(bool_and(active)::text, 'n/a')
      from cron.job
     where jobname = 'webhook-queue-drain'
       and schedule = '* * * * *'
       and active
),
c8 as (
    select 8, 'invoke_webhook_queue_processor usa a chave nova do edge',
           case when p.prosrc ilike '%SUPABASE_EDGE_SECRET_KEY%'
                 and p.prosrc ilike '%x-service-key%'
                 and p.prosrc ilike '%clinvia_http_post%'
                then 'ok' else 'FALHOU' end,
           case when p.prosrc ilike '%SUPABASE_EDGE_SECRET_KEY%' then 'chave nova'
                else 'chave legada' end
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'invoke_webhook_queue_processor'
),
-- 9. `create function` concede EXECUTE a PUBLIC e `revoke from anon` NAO tira.
--    A funcao acorda uma edge function com a chave de servico no header.
c9 as (
    select 9, 'invoke_webhook_queue_processor nao e chamavel por anon',
           case when not has_function_privilege('anon', p.oid, 'EXECUTE')
                 and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                then 'ok' else 'FALHOU' end,
           'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text ||
           ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'invoke_webhook_queue_processor'
),
-- 10. Idempotencia por wamid, que e a condicao 1 dele. Ja existia; fica travada
--     aqui porque e o que impede a retentativa de virar segunda mensagem na
--     conversa e segunda resposta da IA para o paciente.
c10 as (
    select 10, 'messages tem indice unico por (evolution_id, conversation_id)',
           case when count(*) = 1 then 'ok' else 'FALHOU' end,
           coalesce(max(indexname), '(ausente)')
      from pg_indexes
     where schemaname = 'public' and tablename = 'messages'
       and indexdef ilike '%UNIQUE%'
       and indexdef ilike '%evolution_id%'
       and indexdef ilike '%conversation_id%'
),
-- 11. Toda linha gravada pelo caminho da Meta leva sha. Se aparecer `meta_raw`
--     sem sha, a gravacao bruta esta rodando sem a chave de idempotencia e a
--     reentrega volta a duplicar em silencio.
c11 as (
    select 11, 'nenhuma linha meta_raw sem body_sha256',
           case when count(*) = 0 then 'ok' else 'CONFERIR' end,
           count(*)::text || ' linha(s) meta_raw sem sha'
      from public.webhook_queue
     where event_type = 'meta_raw' and body_sha256 is null
)
select * from c1
union all select * from c2
union all select * from c3
union all select * from c4
union all select * from c5
union all select * from c6
union all select * from c7
union all select * from c8
union all select * from c9
union all select * from c10
union all select * from c11
order by ord;
