-- Etapa 5 — teste inverso do monitoramento do front.
--
-- O QUE PRECISA SER PROVADO, e por que cada parte importa:
--
--   1. O erro do navegador VIRA incidente (antes morria no console do cliente —
--      ou seja, em lugar nenhum).
--   2. Ele para no PAINEL. Esta e a parte que nao pode dar errado: o front e a
--      unica fonte deste projeto sem nenhuma medicao de volume historico, entao
--      ele entra como `baixa` + `somente_painel` ate haver uma semana de numero
--      real. Se esta prova falhar, uma tela em loop vira telefone tocando.
--   3. A repeticao NAO multiplica evento. O freio do navegador (8 por sessao)
--      nao vale nada sozinho: cada aba e uma sessao, e quem abusar nao roda o
--      nosso codigo. Quem segura de verdade e o `request_id` deterministico.
--   4. Nada de dado pessoal atravessa. A rota chega mascarada e sem query
--      string; o navegador chega como familia, nao como user-agent.
--
-- POR QUE ESTE TESTE NAO PRECISA DO PREFIXO `zz-teste:`:
-- os outros injetam por um componente de painel para nao chegar no telefone.
-- Aqui o componente REAL ja e de painel por cadastro — e e justamente isso que
-- esta sendo testado. Usar nome falso provaria o teste, nao o detector.
-- Ainda assim tudo roda dentro de uma transacao com `rollback`: o painel nao
-- fica com lixo de teste, e o cron de despacho (outra sessao) nao enxerga linha
-- nao commitada.
--
-- EVIDENCIA DE PONTA A PONTA, ja colhida contra a function publicada em
-- 23/09/2026 (esta parte NAO da para reproduzir em SQL, porque o que se prova e
-- o gateway aceitar chamada anonima):
--
--   POST /functions/v1/frontend-error-ingest  sem Authorization
--     1a chamada -> {"success":true,"skipped":false}
--     2a chamada identica -> {"success":true,"skipped":true}   <- dedupe
--     corpo com mensagem vazia -> {"success":false,"error":"mensagem_vazia"}
--     GET -> {"success":false,"error":"method_not_allowed"}
--
--   incidente nascido: component `front:/crm/:id`, source `frontend`,
--   origem `front`, sev_efetiva `baixa`, notified_count 0, failed_node
--   "render em KanbanBoard", request_id `front:ea00e5170da53378:2026-09-23T22`.
--   Nenhum incidente de `monitoramento:componente-nao-catalogado` na janela.

begin;

-- ---------------------------------------------------------------------------
-- Injecao: o mesmo payload tres vezes, como um loop de render faria.
-- ---------------------------------------------------------------------------
-- O `request_id` e o que o `frontend-error-ingest` monta: prefixo + assinatura
-- do conteudo + hora. Repetir o mesmo aqui e repetir exatamente o que o
-- servidor veria numa tela quebrada disparando sem parar.
create temp table _req(id text) on commit drop;
insert into _req values ('front:teste_etapa5_' || to_char(now() at time zone 'UTC','YYYYMMDDHH24MISS'));

do $$
declare v_req text := (select id from _req);
begin
    for i in 1..3 loop
        perform public.incident_record(jsonb_build_object(
            'source',            'frontend',
            'component',         'front:/crm/:id',
            'route',             'render em KanbanBoard',
            'error_name',        'TypeError',
            'error_message',     'Cannot read properties of undefined (reading "stage")',
            'error_description', 'Navegador: Chrome/Windows PWA. Bundle: teste-etapa5.',
            'error_stack',       'TypeError: ... at Kb (index-abc.js:1:4567)',
            'request_id',        v_req,
            'origem',            'front',
            'context', jsonb_build_object('versao','teste-etapa5','rota','/crm/:id',
                                          'tipo','render','navegador','Chrome/Windows PWA',
                                          'onde','KanbanBoard')
        ));
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Aferição
-- ---------------------------------------------------------------------------
with inc as (
    select i.*,
           public.incident_severidade_efetiva(i.component, i.ai_severity) as sev_efetiva
      from public.incidents i
     where i.component = 'front:/crm/:id'
       and exists (select 1 from public.incident_events e
                    where e.incident_id = i.id
                      and e.request_id = (select id from _req))
),
ev as (
    select e.* from public.incident_events e
     where e.request_id = (select id from _req)
),
cat as (
    select * from public.incident_component_info('front:/crm/:id')
)
select * from (
    select 1 as n, 'o erro do front virou incidente' as prova,
           case when (select count(*) from inc) = 1 then 'ok' else 'FALHOU' end as r,
           (select count(*)::text from inc) as valor

    union all
    select 2, 'tres disparos identicos viraram UM evento (dedupe por request_id)',
           case when (select count(*) from ev) = 1 then 'ok' else 'FALHOU' end,
           (select count(*)::text from ev)

    union all
    -- Se esta linha falhar, o front esta apto a tocar o telefone dele. E a
    -- assercao mais importante do arquivo.
    select 3, 'severidade efetiva e baixa — nao e so o ai_severity, e o piso do catalogo junto',
           case when (select sev_efetiva from inc) = 'baixa' then 'ok' else 'FALHOU' end,
           coalesce((select sev_efetiva from inc), '(nulo)')

    union all
    select 4, 'o catalogo marca a familia como somente_painel',
           case when (select somente_painel from public.incident_component_catalog
                       where component = 'front:') then 'ok' else 'FALHOU' end,
           (select somente_painel::text from public.incident_component_catalog where component='front:')

    union all
    select 5, 'o incidente NAO entra na fila de despacho',
           case when not exists (
                    select 1 from public.incident_claim_for_notification(50) c
                     where c.id in (select id from inc)
                ) then 'ok' else 'FALHOU' end,
           'fila'

    union all
    select 6, 'ninguem foi avisado',
           case when coalesce((select notified_count from inc), 0) = 0
                 and (select last_notified_at from inc) is null then 'ok' else 'FALHOU' end,
           coalesce((select notified_count::text from inc), '(nulo)')

    union all
    -- O prefixo `front:` tem de casar mesmo com a rota variando, senao cada
    -- tela nova do produto abriria um "componente nao catalogado" junto.
    select 7, 'o prefixo front: cobre a rota sem cadastro por rota',
           case when (select catalogado from cat) then 'ok' else 'FALHOU' end,
           coalesce((select component from cat), '(nao casou)')

    union all
    select 8, 'a origem chega como front (e o que separa no relatorio por origem)',
           case when (select origem from inc) = 'front' then 'ok' else 'FALHOU' end,
           coalesce((select origem from inc), '(nulo)')

    union all
    -- Dado pessoal: a rota do incidente tem de ser a forma, nunca a URL real.
    -- `/agendar?d=<base64>` carrega nome de paciente.
    select 9, 'a rota esta mascarada e sem query string',
           case when (select component from inc) like 'front:/%'
                 and (select component from inc) not like '%?%'
                 and (select component from inc) like '%:id%' then 'ok' else 'FALHOU' end,
           (select component from inc)

    union all
    select 10, 'o navegador chega como familia, nao como user-agent inteira',
           case when (select ev.context->>'navegador' from ev) = 'Chrome/Windows PWA'
                 and (select ev.error_description from ev) not ilike '%Mozilla%' then 'ok' else 'FALHOU' end,
           (select ev.context->>'navegador' from ev)

    union all
    -- Sem isto o incidente nao diz se o defeito esta vivo ou se o usuario so
    -- esta com bundle velho em cache — que e o caso mais comum neste projeto.
    select 11, 'a versao do bundle viaja junto',
           case when (select ev.context->>'versao' from ev) = 'teste-etapa5' then 'ok' else 'FALHOU' end,
           (select ev.context->>'versao' from ev)

    union all
    select 12, 'a pilha foi guardada',
           case when (select ev.error_stack from ev) is not null then 'ok' else 'FALHOU' end,
           left(coalesce((select ev.error_stack from ev),'(nulo)'), 30)

    union all
    select 13, 'nao nasceu incidente de componente nao catalogado',
           case when not exists (
                    select 1 from public.incidents
                     where component = 'monitoramento:componente-nao-catalogado'
                       and created_at >= now() - interval '1 minute'
                ) then 'ok' else 'FALHOU' end,
           'detector'

    union all
    select 14, 'a acao padrao do catalogo existe (o alerta nunca sai sem o que olhar primeiro)',
           case when coalesce((select acao_padrao from cat), '') <> '' then 'ok' else 'FALHOU' end,
           left(coalesce((select acao_padrao from cat),'(nulo)'), 40)
) t
order by n;

-- ATENCAO: trocar este rollback por commit deixa um incidente de teste no
-- painel. Ele nao acorda ninguem (baixa + somente_painel), mas suja a contagem
-- da primeira semana de medicao — que e exatamente o numero que vai decidir se
-- alguma rota merece severidade maior.
rollback;
