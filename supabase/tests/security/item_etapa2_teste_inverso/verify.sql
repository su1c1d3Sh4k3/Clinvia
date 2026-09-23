-- Confere o que os tres disparos de `zz-teste-monitoramento` produziram nos
-- ultimos 20 minutos. Roda DEPOIS dos curls (ver README).
--
-- As assercoes olham a severidade EFETIVA, nao a linha do catalogo: e ela que o
-- despacho consulta. Se um dia a regra de casamento mudar, e isto aqui que tem
-- que quebrar.

with recentes as (
    select i.*, ci.somente_painel,
           public.incident_severidade_efetiva(i.component, null) as severidade,
           e.http_code, e.error_message, e.failed_node, e.context
      from public.incidents i
      left join lateral public.incident_component_info(i.component) ci on true
      left join lateral (
           select * from public.incident_events ev
            where ev.incident_id = i.id
            order by ev.received_at desc limit 1) e on true
     where i.created_at > now() - interval '20 minutes'
)
select format('%-6s excecao que escapou do handler virou incidente',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from recentes
 where component = 'zz-teste:edge-etapa2'
   and http_code = 500
   and context->>'escapou_do_handler' = 'true'

union all
select format('%-6s 500 montado na mao virou incidente (sem excecao nenhuma)',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from recentes
 where component = 'zz-teste:edge-etapa2'
   and http_code = 500
   and error_message like '%erro_proposital%'

union all
select format('%-6s falha de provedor virou incidente MESMO com a function respondendo 200',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from recentes
 where component = 'google:credencial_recusada'
   and http_code = 401
   and source = 'integration'
   and context->>'zz_teste' = 'true'

union all
select format('%-6s incidente do provedor sai em nome do PROVEDOR, nao da function',
              case when count(*) = 0 then 'ok' else 'FALHOU' end)
  from recentes
 where http_code = 401
   and component like 'zz-teste-monitoramento%'

union all
select format('%-6s tudo que o teste criou e so-painel ou nao-despachavel: %s de %s',
              case when count(*) filter (where severidade in ('critica','alta')) = 0
                   then 'ok' else 'FALHOU' end,
              count(*) filter (where severidade in ('media','baixa')), count(*))
  from recentes
 where component in ('zz-teste:edge-etapa2', 'google:credencial_recusada')

union all
select format('%-6s origem sai DECLARADA mesmo sem `req` passado na mão (contexto da requisição)',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from public.incident_events e
 where e.received_at > now() - interval '20 minutes'
   and e.failed_node = 'teste-origem-ambiente'
   and e.origem = 'ia_n8n'
   and e.origem_inferida = false

union all
select format('%-6s nenhum incidente do teste foi notificado',
              case when count(*) = 0 then 'ok' else 'FALHOU' end)
  from recentes
 where component in ('zz-teste:edge-etapa2', 'google:credencial_recusada')
   and (last_notified_at is not null or notified_count > 0);
