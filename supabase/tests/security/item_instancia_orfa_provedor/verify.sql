-- Reconciliacao REVERSA da UAZAPI (26/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O que este teste protege: a orfa nao pode voltar a ser invisivel. Ela ja foi
-- duas vezes — o force delete e o `admin-delete-client` apagavam a linha e
-- deixavam a instancia de pe no provedor. Medido em 26/09: 11 no provedor, 2
-- no banco, 9 orfas.
--
-- O que este teste NAO faz: falar com a UAZAPI. Verify nao chama terceiro; se
-- chamasse, uma indisponibilidade do provedor reprovaria a suite inteira e a
-- reprovacao nao diria nada sobre o nosso codigo. Aqui se confere que o
-- DETECTOR existe, esta agendado, esta catalogado com a gravidade acordada e
-- rodou recentemente — o numero de orfas quem mede e ele.

with
c1 as (
    select 1 as ord,
           'componente catalogado' as checagem,
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'uazapi:instancia-orfa' and is_active)
                then 'ok' else 'FALHOU — sem linha no catalogo o piso e a IA' end as resultado,
           coalesce((select natureza || ', ' || severidade_padrao
                       from public.incident_component_catalog
                      where component = 'uazapi:instancia-orfa'), 'ausente') as detalhe
),
-- 2. Divida de cadastro NAO toca o telefone dele. Esta linha e a que impede
--    alguem de "promover" a classe achando que 9 restos de marco sao urgencia.
c2 as (
    select 2, 'baixa, somente painel, com teto',
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'uazapi:instancia-orfa'
                       and severidade_padrao = 'baixa'
                       and severidade_teto = 'baixa'
                       and somente_painel)
                then 'ok'
                else 'FALHOU — a orfa voltou a poder tocar o telefone' end,
           coalesce((select 'padrao ' || severidade_padrao
                            || ', teto ' || coalesce(severidade_teto, 'nenhum')
                            || ', somente_painel ' || somente_painel::text
                       from public.incident_component_catalog
                      where component = 'uazapi:instancia-orfa'), 'ausente')
),
-- 3. O acordador existe e nao e chamavel por quem loga no app.
c3 as (
    select 3, 'acordador existe e nao e publico',
           case when exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'invoke_uzapi_instancias_orfas')
                 and not has_function_privilege('anon', 'public.invoke_uzapi_instancias_orfas()', 'EXECUTE')
                 and not has_function_privilege('authenticated', 'public.invoke_uzapi_instancias_orfas()', 'EXECUTE')
                then 'ok' else 'FALHOU — ausente ou aberto a anon/authenticated' end,
           'anon=' || has_function_privilege('anon', 'public.invoke_uzapi_instancias_orfas()', 'EXECUTE')::text
),
-- 4. Chave NOVA. O `SUPABASE_SERVICE_ROLE_KEY` do vault e o JWT legado: a
--    function compararia com o proprio env e responderia 401 com o cron
--    dizendo `succeeded`. Foi assim que o `alert-notify` ficou mudo por semanas.
c4 as (
    select 4, 'acorda com SUPABASE_EDGE_SECRET_KEY',
           case when (select pg_get_functiondef(p.oid) from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'invoke_uzapi_instancias_orfas')
                     like '%SUPABASE_EDGE_SECRET_KEY%'
                then 'ok' else 'FALHOU — voltou a usar o JWT legado' end,
           ''
),
-- 5. Agendado, e uma vez por dia. Se virar `* * * * *` alguem transformou uma
--    conferencia de cadastro em chamada de terceiro por minuto.
c5 as (
    select 5, 'cron diario agendado',
           case when exists (select 1 from cron.job
                              where jobname = 'uzapi-orfas-scan' and active
                                and schedule ~ '^[0-9]+ [0-9]+ \* \* \*$')
                then 'ok' else 'FALHOU — sem cron, ou deixou de ser diario' end,
           coalesce((select schedule from cron.job where jobname = 'uzapi-orfas-scan'), 'ausente')
),
-- 6. Rodou de verdade nas ultimas 48h. Detector agendado que nunca executa e a
--    mesma cegueira de antes, com um job a mais na lista.
c6 as (
    select 6, 'varreu nas ultimas 48h',
           case when exists (
                    select 1 from cron.job_run_details d
                      join cron.job j on j.jobid = d.jobid
                     where j.jobname = 'uzapi-orfas-scan'
                       and d.start_time > now() - interval '48 hours')
                 or exists (
                    select 1 from public.incidents
                     where component = 'uazapi:instancia-orfa'
                       and last_seen > now() - interval '48 hours')
                then 'ok' else 'CONFERIR — nenhuma varredura na janela' end,
           coalesce((select count(*)::text || ' incidente(s) de orfa em aberto'
                       from public.incidents
                      where component = 'uazapi:instancia-orfa' and status <> 'resolved'), '0')
),
-- 7. O outro sentido continua de pe: provedor que recusa apagar NAO apaga a
--    linha. Os dois lados da reconciliacao sao um par; perder um e voltar a ter
--    orfa, so que pela outra porta.
c7 as (
    select 7, 'sentido de ida preservado (removal_pending_at)',
           case when exists (
                    select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'instances'
                       and column_name = 'removal_pending_at')
                 and exists (
                    select 1 from public.incident_component_catalog
                     where component = 'uazapi:remocao-pendente' and is_active)
                then 'ok' else 'FALHOU — a reconciliacao de ida sumiu' end,
           ''
)
select checagem, resultado, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7
) t order by ord, checagem;
