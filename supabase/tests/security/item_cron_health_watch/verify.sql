-- TESTE DE INJECAO DE FALHA — passo 2 de 2, e teste de acesso do item.
--
-- Roda o varredor e verifica, em uma consulta so, que:
--   1. a chamada injetada foi registrada com o ALVO correto (correlacao),
--   2. o servidor respondeu 401 e o pg_net guardou,
--   3. o varredor transformou isso em incidente NOMEADO e CRITICO,
--   4. o incidente entrou na fila de notificacao,
--   5. os privilegios das funcoes novas estao fechados.
--
-- O CLI do Supabase so devolve o resultado do ULTIMO comando de cada arquivo,
-- entao isto e propositalmente UMA instrucao com CTEs. Nao quebre em varias.
--
-- Pre-requisito: rodar injecao_de_falha.sql e esperar ~10 segundos.

with passada as (
    select public.cron_health_scan() as r
),
injetada as (
    select c.request_id, c.alvo, c.origem, r.status_code, r.content
      from public.cron_http_calls c
      left join net._http_response r on r.id = c.request_id
     where c.origem = 'teste:injecao-de-falha'
     order by c.request_id desc
     limit 1
),
incidente as (
    -- `cross join passada` NAO e enfeite: sem uma dependencia explicita o
    -- planejador pode avaliar esta CTE ANTES da varredura e o teste reprova um
    -- incidente que existe. Aconteceu na primeira execucao.
    select i.id, i.component, i.ai_severity, i.status, i.event_count,
           i.notified_count, i.notify_next_attempt_at
      from public.incidents i
      cross join passada
     where i.component = 'cron-http:alert-notify'
     order by i.last_seen desc
     limit 1
),
checagens as (
    select 'varredor rodou sem erro' as item,
           coalesce(((select r from passada) ->> 'ok')::boolean, false) as ok,
           (select r from passada) as detalhe
    union all
    select 'chamada injetada foi correlacionada ao alvo',
           (select alvo from injetada) = 'alert-notify',
           jsonb_build_object('request_id', (select request_id from injetada),
                              'alvo', (select alvo from injetada))
    union all
    select 'servidor respondeu 401 (dependencia realmente quebrada)',
           (select status_code from injetada) = 401,
           jsonb_build_object('status_code', (select status_code from injetada),
                              'corpo', left(coalesce((select content from injetada), ''), 120))
    union all
    select 'virou incidente NOMEADO (nao http-desconhecido)',
           exists (select 1 from incidente),
           coalesce((select jsonb_build_object('component', component, 'event_count', event_count)
                       from incidente), '{}'::jsonb)
    union all
    select 'severidade critica (401 nunca entra abaixo disso)',
           (select ai_severity from incidente) = 'critica',
           jsonb_build_object('ai_severity', (select ai_severity from incidente))
    union all
    select 'entrou na fila de notificacao',
           coalesce((select notified_count from incidente), 0) > 0
             or (select notify_next_attempt_at from incidente) is not null
             or public.incident_notify_pending_count() > 0,
           jsonb_build_object('notified_count', (select notified_count from incidente),
                              'pendentes', public.incident_notify_pending_count())
    union all
    select 'EXECUTE anon -> cron_health_scan',
           has_function_privilege('anon', 'public.cron_health_scan(integer)', 'EXECUTE') = false,
           '{}'::jsonb
    union all
    select 'EXECUTE authenticated -> cron_health_scan',
           has_function_privilege('authenticated', 'public.cron_health_scan(integer)', 'EXECUTE') = false,
           '{}'::jsonb
    union all
    select 'EXECUTE anon -> clinvia_http_post',
           has_function_privilege('anon', 'public.clinvia_http_post(text,text,text,jsonb,jsonb,integer)', 'EXECUTE') = false,
           '{}'::jsonb
    union all
    select 'EXECUTE authenticated -> clinvia_http_post',
           has_function_privilege('authenticated', 'public.clinvia_http_post(text,text,text,jsonb,jsonb,integer)', 'EXECUTE') = false,
           '{}'::jsonb
    union all
    select 'cron-health-watch agendado e ativo',
           exists (select 1 from cron.job where jobname = 'cron-health-watch' and active),
           coalesce((select jsonb_build_object('schedule', schedule) from cron.job
                      where jobname = 'cron-health-watch'), '{}'::jsonb)
    union all
    select 'crons orfaos do financeiro desagendados',
           not exists (select 1 from cron.job
                        where jobname in ('financial_due_daily', 'financial_overdue_daily')),
           '{}'::jsonb
)
select * from checagens order by ok, item;
