-- Teste inverso da Etapa 3 — injetar duas negativas de permissao DIFERENTES na
-- mesma tabela e provar que elas nao se fundem, e que o incidente sai com o
-- nome da politica dentro.
--
-- Injeta pela porta da frente (`incident_record`), com o texto exato que o
-- Postgres produz. Componente `zz-teste:permissao` casa com o prefixo
-- `zz-teste:` do catalogo — `baixa` + `somente_painel`. Aqui o alvo da
-- assercao NAO e a severidade do despacho (a regra do 42501 forca `alta` no
-- `ai_severity` de proposito, e isso e o certo: RLS quebrada e grave); e o
-- AGRUPAMENTO e o DIAGNOSTICO. O prefixo segura o envio.
--
-- Nao escreve em tabela de negocio, nao dispara envio, e limpa o que criou.

begin;

-- 1. INSERT barrado pelo `with check`.
select public.incident_record(jsonb_build_object(
    'source', 'edge_function',
    'component', 'zz-teste:permissao',
    'route', 'POST zz-teste-insert',
    'http_code', 403,
    'request_id', 'zz-teste-rls-insert',
    'error_message', 'new row violates row-level security policy for table "crm_client" [42501]',
    'started_at', now()
)) as injecao_insert;

-- 2. UPDATE barrado pelo `using` — MESMA tabela, defeito diferente.
select public.incident_record(jsonb_build_object(
    'source', 'edge_function',
    'component', 'zz-teste:permissao',
    'route', 'PATCH zz-teste-update',
    'http_code', 403,
    'request_id', 'zz-teste-rls-update',
    'error_message', 'new row violates row-level security policy (USING expression) for table "crm_client" [42501]',
    'started_at', now()
)) as injecao_update;

-- 3. Grant de tabela faltando.
select public.incident_record(jsonb_build_object(
    'source', 'edge_function',
    'component', 'zz-teste:permissao',
    'route', 'GET zz-teste-grant',
    'http_code', 403,
    'request_id', 'zz-teste-rls-grant',
    'error_message', 'permission denied for table token_usage_log [42501]',
    'started_at', now()
)) as injecao_grant;

with ev as (
    select * from public.incident_events
     where request_id in ('zz-teste-rls-insert','zz-teste-rls-update','zz-teste-rls-grant')
)
select format('%-6s as 3 negativas viraram 3 incidentes SEPARADOS (nao se fundiram por tabela)',
              case when count(distinct incident_id) = 3 then 'ok' else 'FALHOU' end)
  from ev

union all
select format('%-6s a operacao foi lida do texto: insert_ou_update / update / grant_de_tabela',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from ev
 where (request_id = 'zz-teste-rls-insert'  and context->>'rls_operacao' = 'insert_ou_update')
    or (request_id = 'zz-teste-rls-update'  and context->>'rls_operacao' = 'update')
    or (request_id = 'zz-teste-rls-grant'   and context->>'rls_operacao' = 'grant_de_tabela')

union all
select format('%-6s a tabela foi extraida nos 3 casos (inclusive no texto de grant, que nao usa aspas)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from ev
 where context->>'rls_tabela' in ('crm_client','token_usage_log')

union all
select format('%-6s o diagnostico NOMEIA politica de verdade da tabela (nao texto generico)',
              case when count(*) = 2 then 'ok' else 'FALHOU' end)
  from ev
 where context->>'rls_tabela' = 'crm_client'
   and context->>'rls_diagnostico' like '%Politicas:%'
   and context->>'rls_diagnostico' like '%RLS ligada%'

union all
select format('%-6s no caso de grant o diagnostico lista os grants de anon/authenticated',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from ev
 where request_id = 'zz-teste-rls-grant'
   and context->>'rls_diagnostico' like '%Grants de tabela:%'

union all
select format('%-6s o diagnostico subiu para a causa provavel do incidente (e o que o alerta le)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from public.incidents i
 where i.component = 'zz-teste:permissao'
   and i.ai_probable_cause is not null

union all
select format('%-6s RLS continua sendo tratada como ALTA na analise (a regra do 42501 nao se perdeu)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from public.incidents i
 where i.component = 'zz-teste:permissao' and i.ai_severity = 'alta'

union all
select format('%-6s mas o DESPACHO nao pega nada disto: prefixo zz-teste: e somente_painel',
              case when bool_and(ci.somente_painel) then 'ok' else 'FALHOU' end)
  from public.incidents i
  left join lateral public.incident_component_info(i.component) ci on true
 where i.component = 'zz-teste:permissao'

union all
select format('%-6s nenhum dos tres foi notificado',
              case when count(*) = 0 then 'ok' else 'FALHOU' end)
  from public.incidents i
 where i.component = 'zz-teste:permissao'
   and (i.last_notified_at is not null or i.notified_count > 0);

rollback;
