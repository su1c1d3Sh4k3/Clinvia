-- Teste inverso da Etapa 4 — quebrar o provisionamento de proposito e provar
-- que os tres detectores acendem, cada um com o seu diagnostico.
--
-- POR QUE ESTE NAO USA O PREFIXO `zz-teste:`
-- ------------------------------------------
-- Os outros testes injetam por um componente de painel para nao chegar no
-- telefone. Aqui isso nao serviria: o que precisa ser provado e justamente que
-- `provisionamento:erro`, `provisionamento:fila-travada` e
-- `provisionamento:conta-sem-chave` — os nomes REAIS, catalogados em `alta` —
-- nascem certos. Testar com nome falso provaria o teste, nao o detector.
--
-- O que segura o alerta entao e a TRANSACAO: tudo roda dentro de
-- `begin`/`rollback`. O despacho e outro processo (cron `alert-dispatch`,
-- `* * * * *`), e nenhuma outra sessao enxerga linha nao commitada. Quando o
-- rollback acontece, o incidente, o evento e a avaria simulada somem juntos.
-- Nada escapa, nem para o painel.
--
-- ATENCAO ao mexer neste arquivo: trocar o `rollback` final por `commit`
-- publica tres incidentes ALTA de verdade e o despacho manda no WhatsApp dele
-- em ate um minuto. O rollback e o mecanismo de seguranca, nao arrumacao.
--
-- COMO A AVARIA E SIMULADA
-- ------------------------
-- Nao cria conta nova (`profiles` pende de `auth.users`, e criar usuario para
-- testar seria pior que o defeito). Pega uma conta que ja existe e, dentro da
-- transacao, arranca dela o projeto e a chave — que e exatamente o estado em
-- que uma conta nova mal provisionada fica. `status` nao e tocado, entao o
-- trigger de enfileiramento (`AFTER INSERT OR UPDATE OF status`) nao dispara e
-- nao polui a fila.
--
-- Achado que este teste rendeu: o erro injetado diz `insufficient_quota`, e esse
-- texto casa com uma regra do catalogo de MENSAGENS que vale `critica`. Ou
-- seja, na vida real um provisionamento que falha por falta de credito na
-- OpenAI sobe sozinho de `alta` para `critica` — o que esta certo (a
-- organizacao inteira esta sem credito, nao so aquela conta), mas nao era
-- intencao declarada do catalogo de componente. Fica registrado para nao ser
-- lido como bug depois.

begin;

-- Cobaia: a conta `admin` ativa mais antiga. Qualquer uma serve — o que importa
-- e ser `role = 'admin'`, que e o filtro que o detector usa.
create temporary table _cobaia on commit drop as
select p.id
  from public.profiles p
 where p.role = 'admin' and p.status = 'ativo'
 order by p.created_at
 limit 1;

-- 1. Avaria A + C: o worker falhou e a conta ficou sem projeto e sem chave.
update public.profiles p
   set openai_project_id      = null,
       openai_token           = null,
       openai_api_key_id      = null,
       openai_provision_error = 'insufficient_quota: organizacao sem limite para novos projetos (zz-teste)'
 where p.id in (select id from _cobaia);

-- 2. Avaria B: job vivo ha muito mais que a carencia.
insert into public.openai_provision_queue (profile_id, status, attempts, last_error, created_at, updated_at)
select id, 'pending', 4, 'timeout ao chamar a API da OpenAI (zz-teste)',
       now() - interval '3 hours', now() - interval '3 hours'
  from _cobaia;

select public.provisionamento_scan() as varredura;

-- ── assercoes ───────────────────────────────────────────────────────────────

-- `ai_severity` NAO e o que o despacho le. `incident_record` pode preencher
-- esse campo a partir do catalogo de MENSAGENS (o que casa por texto do erro), e
-- `incident_set_severidade_inicial` so escreve quando ele esta nulo. Quem manda
-- no telefone e `incident_severidade_efetiva(component, ai_severity)`, que pega
-- o PIOR entre os dois. Por isso as assercoes abaixo olham a efetiva — a
-- primeira versao deste teste olhava `ai_severity` e acusou falha num detector
-- que estava certo.
with ev as (
    select e.*, i.ai_severity, i.component as comp,
           public.incident_severidade_efetiva(i.component, i.ai_severity) as sev_efetiva
      from public.incident_events e
      join public.incidents i on i.id = e.incident_id
     where e.owner_id in (select id from _cobaia)
       and e.component like 'provisionamento:%'
       and e.received_at >= now() - interval '2 minutes'
)
select format('%-6s os tres detectores acenderam (erro / fila-travada / conta-sem-chave)',
              case when count(distinct comp) = 3 then 'ok' else 'FALHOU' end)
  from ev

union all
select format('%-6s cada um virou um incidente SEPARADO (nao se fundiram num so)',
              case when count(distinct incident_id) = 3 then 'ok' else 'FALHOU' end)
  from ev

union all
select format('%-6s os tres despacham como alta ou pior (nenhum cai no padrao media)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from ev where sev_efetiva in ('alta', 'critica')

union all
-- A prova de que o piso do catalogo de componente serve para alguma coisa: o
-- texto "timeout" casa com uma regra de mensagem que devolve `media`, e ainda
-- assim o incidente sai como `alta`. Sem o piso, uma fila travada por timeout
-- ficaria so no painel.
select format('%-6s o piso do catalogo resgata a fila travada (mensagem dizia media)',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from ev
 where comp = 'provisionamento:fila-travada'
   and ai_severity = 'media' and sev_efetiva = 'alta'

union all
select format('%-6s o incidente de erro carrega o texto que a OpenAI devolveu',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from ev
 where comp = 'provisionamento:erro'
   and error_message like '%insufficient_quota%'

union all
select format('%-6s o de fila diz ha quanto tempo e quantas tentativas (nao so "falhou")',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from ev
 where comp = 'provisionamento:fila-travada'
   and error_message like '%4 tentativa(s)%'
   and (context ->> 'tentativas')::int = 4

union all
-- Este e o pulo do gato do detector C: com job na fila a culpa e do worker;
-- sem job, o enfileiramento e que nao aconteceu. Sao consertos diferentes.
select format('%-6s o de conta-sem-chave aponta o culpado certo (ha job => defeito do worker)',
              case when count(*) = 1 then 'ok' else 'FALHOU' end)
  from ev
 where comp = 'provisionamento:conta-sem-chave'
   and error_description like '%defeito esta no worker%'
   and (context ->> 'tem_job_na_fila')::boolean is true

union all
select format('%-6s a conta afetada viaja no incidente (owner_id preenchido nos 3)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from ev where owner_id is not null

union all
select format('%-6s a acao padrao do catalogo chegou nos 3 (o alerta nao sai sem o que fazer)',
              case when count(*) = 3 then 'ok' else 'FALHOU' end)
  from ev
  join lateral public.incident_component_info(ev.comp) ci on true
 where ci.acao_padrao is not null

union all
-- A prova de que nada vazou: o despacho nunca viu estas linhas, porque elas
-- nunca foram commitadas.
select format('%-6s nenhum dos tres foi notificado dentro da transacao',
              case when count(*) = 0 then 'ok' else 'FALHOU' end)
  from public.incidents i
 where i.component like 'provisionamento:%'
   and i.last_seen >= now() - interval '2 minutes'
   and (i.last_notified_at is not null or i.notified_count > 0)

union all
-- Segunda passada sem mudar nada: a janela horaria do request_id tem que
-- segurar. Sem isso, uma conta quebrada geraria 4 eventos por hora para sempre.
select format('%-6s repetir a varredura NAO duplica evento (dedupe por hora funciona)',
              case when (r -> 'incidentes' ->> 'erro')::int = 0
                    and (r -> 'incidentes' ->> 'fila_travada')::int = 0
                    and (r -> 'incidentes' ->> 'conta_sem_chave')::int = 0
                   then 'ok' else 'FALHOU' end)
  from (select public.provisionamento_scan() as r) s

union all
select format('%-6s so service_role executa a varredura',
              case when not has_function_privilege('anon', 'public.provisionamento_scan()', 'EXECUTE')
                    and not has_function_privilege('authenticated', 'public.provisionamento_scan()', 'EXECUTE')
                    and has_function_privilege('service_role', 'public.provisionamento_scan()', 'EXECUTE')
                   then 'ok' else 'FALHOU' end);

rollback;
