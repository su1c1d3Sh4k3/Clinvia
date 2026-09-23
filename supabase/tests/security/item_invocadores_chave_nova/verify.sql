-- Item 6: migracao dos invocadores de cron para a chave nova + rastro.
--
-- Este arquivo confere ESTADO. A prova de que o caminho inteiro roda foi feita
-- ao vivo em 23/09/2026, disparando cada funcao de verdade e correlacionando a
-- chamada em cron_http_calls com a resposta em net._http_response:
--
--   campaign-dispatch           req 78021  HTTP 200  {"success":true}
--                               + efeito observavel: campanha de teste
--                                 dispatching -> dispatched as 11:05:59
--   auto-close-worker           req 78095  HTTP 200  {"success":true,...}
--   conversation-summary-worker req ~78100 HTTP 200  (log do gateway 11:12:03)
--   delivery-automation-worker  req 78094  sem codigo HTTP: a funcao demora mais
--                               que os 5s do pg_net. Prova veio do log interno
--                               da propria function (ver ACHADO abaixo).
--
-- ACHADO ABERTO (nao e regressao desta migration, e anterior a ela):
--   delivery-automation-worker gira em falso por 120s a cada invocacao. O RPC
--   pick_delivery_automation_job() e `RETURNS delivery_automation_jobs`, entao
--   quando nao ha job ele devolve uma LINHA DE NULOS, nao NULL. O `if (!job)
--   break` do worker nunca dispara. Aguardando decisao do dono.
--
-- Esperado: todas as linhas 'OK'.

with alvos(fn, alvo) as (
    values ('invoke_campaign_dispatch',            'campaign-dispatch'),
           ('invoke_conversation_summary_worker',  'conversation-summary-worker'),
           ('invoke_delivery_automation_worker',   'delivery-automation-worker'),
           ('invoke_auto_close_worker',            'auto-close-worker'),
           ('invoke_alert_dispatch',               'alert-notify'),
           ('instagram_refresh_tokens_run',        'instagram-refresh-token')
),
src as (
    select a.fn, a.alvo, p.oid, p.prosrc
      from alvos a
      left join pg_proc p on p.proname = a.fn and p.prokind = 'f'
      left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
),
c1 as (
    select 'funcao existe' as verificacao, s.fn as detalhe,
           case when s.oid is null then 'FALHOU - nao existe' else 'OK' end as resultado
      from src s
),
c2 as (
    select 'usa a chave nova' as verificacao, s.fn as detalhe,
           case when s.prosrc is null then 'FALHOU - nao existe'
                when s.prosrc ilike '%SUPABASE_EDGE_SECRET_KEY%' then 'OK'
                else 'FALHOU - ainda so le o JWT legado' end as resultado
      from src s
),
c3 as (
    select 'chamada rastreada' as verificacao, s.fn as detalhe,
           case when s.prosrc is null then 'FALHOU - nao existe'
                when s.prosrc ilike '%clinvia_http_post%' then 'OK'
                else 'FALHOU - net.http_post cru, falha ficaria anonima' end as resultado
      from src s
),
c4 as (
    select 'fechada para o front' as verificacao, s.fn as detalhe,
           case when s.oid is null then 'FALHOU - nao existe'
                when has_function_privilege('anon', s.oid, 'EXECUTE')
                  or has_function_privilege('authenticated', s.oid, 'EXECUTE')
                then 'FALHOU - executavel pelo front' else 'OK' end as resultado
      from src s
),
c5 as (
    -- o rastro so serve se o nome chegar na tabela
    select 'ja deixou rastro real' as verificacao, s.alvo as detalhe,
           case when exists (select 1 from public.cron_http_calls c where c.alvo = s.alvo)
                then 'OK' else 'SEM DADO - nenhuma chamada na janela de 2h do podador' end as resultado
      from src s
),
c6 as (
    -- ninguem novo pode voltar a nascer com GUC
    select 'nenhum cron em app.settings' as verificacao,
           coalesce(string_agg(j.jobname, ', '), '(nenhum)') as detalhe,
           case when count(*) = 0 then 'OK' else 'FALHOU' end as resultado
      from cron.job j
     where j.command ilike '%app.settings.%'
)
select * from c1
union all select * from c2
union all select * from c3
union all select * from c4
union all select * from c5
union all select * from c6
order by verificacao, detalhe;
