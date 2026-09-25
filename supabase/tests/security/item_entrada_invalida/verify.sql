-- Estado DEPOIS de 20260923540000 (erro de entrada: contar sem alertar).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_entrada_invalida/verify.sql
--
-- POR QUE ESTE TESTE NAO ACORDA O CELULAR DELE
-- ============================================
-- Ele INJETA ocorrencias falsas e roda o detector de verdade — a unica forma de
-- provar que as duas regras disparam. O detector, disparando, cria incidente
-- `entrada-invalida:surto`, que e `alta` e NAO e somente_painel: se escapasse,
-- viraria WhatsApp.
--
-- Nao escapa porque o endpoint de SQL executa o arquivo inteiro como UMA
-- transacao (medido: um `rollback` no meio derruba ate o `create table` das
-- linhas de cima). Injecao, varredura e limpeza acontecem dentro dela; nenhuma
-- outra sessao — inclusive o cron `alert-dispatch`, que roda a cada minuto —
-- chega a enxergar as linhas. O que sobra e a tabela temporaria com o placar.
--
-- Se o arquivo abortar no meio, a transacao inteira volta atras e tambem nao
-- sobra nada. Nao ha estado intermediario possivel.
--
-- Alvos de teste: `entrada:zz-teste-detector` (familia somente_painel).

create temp table _placar (chave text primary key, valor jsonb);

-- ── 1. cadastro, privilegio e cron ───────────────────────────────────────────
insert into _placar
select 'cadastro', jsonb_build_object(
    'ok_coluna_chave_de_desligar', exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'llm_platform_settings'
           and column_name = 'alert_input_rate_enabled'),
    'catalogo', (
        select coalesce(jsonb_object_agg(c.component, jsonb_build_object(
                'match', c.match_tipo, 'natureza', c.natureza,
                'piso', c.severidade_padrao, 'somente_painel', c.somente_painel,
                'ativo', c.is_active)), '{}'::jsonb)
          from public.incident_component_catalog c
         where c.component in ('entrada:', 'entrada-invalida:surto', 'entrada-invalida:persistente')),
    -- o que segura o telefone e ESTE campo, nao o piso baixo
    'ok_familia_entrada_e_somente_painel', (
        select c.somente_painel from public.incident_component_catalog c where c.component = 'entrada:'),
    'ok_familia_entrada_casa_por_prefixo', (
        -- casar = vir linha; a coluna `catalogado` (sempre `true`) sumiu na
        -- re-emissao da funcao em 20260924180000.
        select ci.component = 'entrada:' and ci.somente_painel
          from public.incident_component_info('entrada:api-scheduling') ci),
    'ok_detectores_nao_sao_somente_painel', (
        select count(*) = 2 from public.incident_component_catalog c
         where c.component like 'entrada-invalida:%' and not c.somente_painel));

insert into _placar
select 'privilegio', jsonb_build_object(
    'ok_security_definer', p.prosecdef,
    'ok_search_path_fixo', p.proconfig::text ilike '%search_path%',
    -- `create function` concede EXECUTE a PUBLIC; `revoke from anon` NAO tira
    'ok_anon_nao_executa',          not has_function_privilege('anon', p.oid, 'EXECUTE'),
    'ok_authenticated_nao_executa', not has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'ok_service_role_executa',      has_function_privilege('service_role', p.oid, 'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'entrada_invalida_scan';

insert into _placar
select 'cron', jsonb_build_object(
    'existe',   exists (select 1 from cron.job where jobname = 'entrada-invalida-scan'),
    'schedule', (select schedule from cron.job where jobname = 'entrada-invalida-scan'),
    'ativo',    (select active   from cron.job where jobname = 'entrada-invalida-scan'));

-- ── 2. injecao ───────────────────────────────────────────────────────────────
-- A: 10 ocorrencias do MESMO alvo em 1h  -> tem que virar surto.
insert into public.incident_events
    (received_at, source, component, failed_node, error_message, http_code, origem)
select now() - (i * interval '3 minutes'),
       'edge_function', 'entrada:zz-teste-detector',
       'zz_teste_surto:22P02',
       'entrada invalida [22P02] em zz_teste_surto', 400, 'ia_n8n'
  from generate_series(1, 10) i;

-- B: 2 ocorrencias em 2 DIAS distintos (fuso SP) -> tem que virar persistencia.
--    Rota diferente de propósito: assim as 10 de cima nao contaminam a regra
--    lenta (elas caem num dia so) e cada regra e avaliada isolada.
insert into public.incident_events
    (received_at, source, component, failed_node, error_message, http_code, origem)
values
    (now() - interval '2 hours', 'edge_function', 'entrada:zz-teste-detector',
     'zz_teste_lento:22007', 'entrada invalida [22007] em zz_teste_lento', 400, 'ia_n8n'),
    (now() - interval '3 days',  'edge_function', 'entrada:zz-teste-detector',
     'zz_teste_lento:22007', 'entrada invalida [22007] em zz_teste_lento', 400, 'ia_n8n');

-- ── 3. as duas regras disparam ───────────────────────────────────────────────
insert into _placar select 'varredura_1', public.entrada_invalida_scan();

-- ── 4. e nao repetem na passagem seguinte ────────────────────────────────────
-- Sem o silencio por fingerprint o cron (*/10) reabriria o placar 6x por hora e
-- o contador de recorrencia dispararia reenvio sozinho.
insert into _placar select 'varredura_2_dedupe', public.entrada_invalida_scan();

-- ── 5. o que foi criado ──────────────────────────────────────────────────────
insert into _placar
select 'incidentes_criados', coalesce(jsonb_agg(jsonb_build_object(
        'component', i.component,
        'sev_efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity),
        'origem', i.origem,
        'eventos', i.event_count) order by i.component), '[]'::jsonb)
  from public.incidents i
 where i.component like 'entrada-invalida:%';

insert into _placar
select 'assercoes', jsonb_build_object(
    'ok_surto_criado',       (select (valor ->> 'surtos')::int = 1        from _placar where chave = 'varredura_1'),
    'ok_persistente_criado', (select (valor ->> 'persistentes')::int = 1  from _placar where chave = 'varredura_1'),
    'ok_dedupe_segurou',     (select valor ->> 'surtos' = '0' and valor ->> 'persistentes' = '0'
                                from _placar where chave = 'varredura_2_dedupe'),
    'ok_surto_e_alta', (
        select public.incident_severidade_efetiva(i.component, i.ai_severity) = 'alta'
          from public.incidents i where i.component = 'entrada-invalida:surto'),
    -- o evento individual NUNCA pode virar mensagem: ele so conta
    'ok_evento_individual_nao_alerta', (
        select public.incident_severidade_efetiva('entrada:zz-teste-detector', null) is not null
           and (select somente_painel from public.incident_component_catalog where component = 'entrada:')),
    'ok_contexto_nomeia_o_alvo', (
        select e.context ? 'alvo' and e.context ? 'ocorrencias'
          from public.incident_events e
         where e.component = 'entrada-invalida:surto' limit 1));

-- ── 6. a chave de desligar para o detector, NAO a contagem ───────────────────
update public.llm_platform_settings set alert_input_rate_enabled = false;
insert into _placar select 'com_chave_desligada', public.entrada_invalida_scan();
update public.llm_platform_settings set alert_input_rate_enabled = true;

insert into _placar
select 'assercao_chave', jsonb_build_object(
    'ok_desligou', (select valor ->> 'desligado' = 'true' from _placar where chave = 'com_chave_desligada'),
    -- desligar o detector nao pode apagar evento nenhum
    'ok_eventos_seguem_contando', (
        select count(*) = 12 from public.incident_events
         where component = 'entrada:zz-teste-detector'));

-- ── 7. limpeza, ainda dentro da mesma transacao ──────────────────────────────
delete from public.incident_notifications n
 using public.incidents i
 where n.incident_id = i.id and i.component like 'entrada-invalida:%';
delete from public.incident_events
 where component = 'entrada:zz-teste-detector'
    or component like 'entrada-invalida:%';
delete from public.incidents where component like 'entrada-invalida:%';

insert into _placar
select 'limpeza', jsonb_build_object(
    'eventos_restantes',    (select count(*) from public.incident_events
                              where component = 'entrada:zz-teste-detector'
                                 or component like 'entrada-invalida:%'),
    'incidentes_restantes', (select count(*) from public.incidents
                              where component like 'entrada-invalida:%'),
    'ok_chave_restaurada',  (select bool_and(coalesce(alert_input_rate_enabled, true))
                               from public.llm_platform_settings));

select jsonb_pretty(jsonb_object_agg(chave, valor)) as relatorio from _placar;
