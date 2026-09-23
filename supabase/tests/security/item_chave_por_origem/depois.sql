-- Estado DEPOIS das chaves por origem (item 2 / item 5).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_chave_por_origem/depois.sql
--
-- COMO LER ESTE RELATORIO
-- ======================
-- O bloco `serie_inteira` repete LETRA POR LETRA a consulta do `antes.sql`, e
-- por isso NAO vai bater a meta: ele inclui os 230 eventos ja gravados, e
-- `origem_inferida` e decidido na ESCRITA — evento velho nao muda de opiniao.
-- Reescrever o passado para a meta fechar seria mentir sobre ele.
--
-- A meta (`origem_inferida` < 10%) se mede em `janela_nova`: eventos nascidos
-- depois da virada. Enquanto essa janela tiver poucas linhas, o percentual
-- balanca muito — o numero que vale e o de `prova_por_execucao`, que nao
-- depende de volume.
--
-- `prova_por_execucao` usa componente `zz-teste:` (familia somente_painel) e
-- roda dentro da transacao unica do endpoint de SQL, com limpeza no fim:
-- nenhum outro processo — inclusive o cron `alert-dispatch`, a cada minuto —
-- chega a enxergar as linhas.

create temp table _placar (chave text primary key, valor jsonb);

-- ── 1. todo ponto de chamada declara? (prova estatica) ───────────────────────
-- Conta no CORPO EM PRODUCAO, nao no arquivo de migration: e o corpo que roda.
-- A contagem de declaracoes e por EXPRESSAO REGULAR, `'origem' , '<literal>'`,
-- e nao por busca de texto. Duas armadilhas ja pegas aqui:
--   - `'origem',` cru tambem casa com `'origem', v_reg.origem` do `context` do
--     `cron_health_scan` (campo da resposta HTTP, nada a ver com a origem do
--     incidente) — esse falso positivo escondeu 5 chamadas sem declaracao;
--   - `'origem', '` exige um espaco que nem todo chamador escreve
--     (`entrada_invalida_scan` quebra a linha), e a contagem zerava sozinha.
create temp view _chamadores as
select p.proname as fn,
       (length(d.def) - length(replace(d.def, 'incident_record(jsonb_build_object(', '')))
           / length('incident_record(jsonb_build_object(')                       as chamadas,
       (select count(*) from regexp_matches(d.def, '''origem''\s*,\s*''[a-z_]+''', 'g')) as declaracoes,
       (select coalesce(jsonb_agg(distinct m[1]), '[]'::jsonb)
          from regexp_matches(d.def, '''origem''\s*,\s*''([a-z_]+)''', 'g') m)   as valores
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join lateral (select pg_get_functiondef(p.oid) as def) d on true
 where n.nspname = 'public'
   and d.def like '%incident_record(jsonb_build_object(%'
   and p.proname <> 'incident_record';

insert into _placar
select 'declaracao_no_codigo', coalesce(jsonb_object_agg(fn, jsonb_build_object(
        'chamadas', chamadas, 'declaracoes', declaracoes, 'valores', valores)), '{}'::jsonb)
  from _chamadores;

insert into _placar
select 'assercao_declaracao', jsonb_build_object(
    -- todo chamador declara em TODAS as suas chamadas, nao em uma delas
    'ok_todos_declaram_em_todas', (select bool_and(declaracoes >= chamadas) from _chamadores),
    'chamadores_encontrados',     (select count(*) from _chamadores),
    'faltando', (select coalesce(jsonb_agg(fn), '[]'::jsonb)
                   from _chamadores where declaracoes < chamadas));

-- ── 2. prova por execucao: declarado x omitido, lado a lado ──────────────────
insert into _placar
select 'prova_por_execucao', jsonb_build_object(
    'declarado', public.incident_record(jsonb_build_object(
        'origem',    'cron',
        'source',    'db_job',
        'component', 'zz-teste:origem-declarada',
        'failed_node', 'zz_origem:declarada',
        'error_message', 'prova de origem declarada',
        'http_code', 200)),
    'omitido', public.incident_record(jsonb_build_object(
        'source',    'db_job',
        'component', 'zz-teste:origem-omitida',
        'failed_node', 'zz_origem:omitida',
        'error_message', 'prova de origem inferida',
        'http_code', 200)));

insert into _placar
select 'assercao_execucao', jsonb_build_object(
    'declarado', (
        select jsonb_build_object('origem', e.origem, 'inferida', e.origem_inferida)
          from public.incident_events e where e.component = 'zz-teste:origem-declarada'),
    'omitido', (
        select jsonb_build_object('origem', e.origem, 'inferida', e.origem_inferida)
          from public.incident_events e where e.component = 'zz-teste:origem-omitida'),
    'ok_declarado_nao_e_palpite', (
        select not e.origem_inferida and e.origem = 'cron'
          from public.incident_events e where e.component = 'zz-teste:origem-declarada'),
    -- o controle: sem a linha nova, o mesmo payload volta a ser palpite
    'ok_omitido_ainda_e_palpite', (
        select e.origem_inferida
          from public.incident_events e where e.component = 'zz-teste:origem-omitida'));

delete from public.incident_notifications n using public.incidents i
 where n.incident_id = i.id and i.component like 'zz-teste:origem-%';
delete from public.incident_events where component like 'zz-teste:origem-%';
delete from public.incidents      where component like 'zz-teste:origem-%';

insert into _placar
select 'limpeza', jsonb_build_object(
    'eventos_restantes',    (select count(*) from public.incident_events
                              where component like 'zz-teste:origem-%'),
    'incidentes_restantes', (select count(*) from public.incidents
                              where component like 'zz-teste:origem-%'));

-- ── 3. a chamada do n8n nunca mais como `edge_interna` ───────────────────────
-- Componentes `api-%` so existem porque o n8n os chama. A checagem e sobre a
-- janela NOVA: os 3 eventos antigos com `edge_interna` sao o defeito medido no
-- `antes.sql`, e ficam la como registro do que foi corrigido.
insert into _placar
select 'n8n_nao_e_edge_interna', jsonb_build_object(
    'antigos_edge_interna_em_api', (
        select count(*) from public.incident_events
         where component like 'api-%' and origem = 'edge_interna'
           and received_at < (select coalesce(max(applied_at), now() - interval '1 day')
                                from (select now() as applied_at) t)),
    'na_janela_nova', (
        select coalesce(jsonb_object_agg(origem, n), '{}'::jsonb) from (
            select origem, count(*) as n from public.incident_events
             where component like 'api-%'
               and received_at >= now() - interval '1 hour'
             group by 1) z));

-- ── 4. medicao: serie inteira (comparavel ao antes) e janela nova ────────────
insert into _placar
select 'serie_inteira', jsonb_build_object(
    'eventos_total', (select count(*) from public.incident_events),
    'inferidos',     (select count(*) from public.incident_events where origem_inferida),
    'pct_inferido',  (select round(100.0 * count(*) filter (where origem_inferida) / nullif(count(*), 0), 1)
                        from public.incident_events),
    'por_origem', (
        select coalesce(jsonb_object_agg(x.origem, x.j), '{}'::jsonb) from (
            select coalesce(origem, 'nulo') as origem,
                   jsonb_build_object('total', count(*),
                                      'inferidos', count(*) filter (where origem_inferida)) as j
              from public.incident_events group by 1) x));

insert into _placar
select 'janela_nova', jsonb_build_object(
    'desde', 'ultima 1 hora',
    'eventos_total', (select count(*) from public.incident_events
                       where received_at >= now() - interval '1 hour'),
    'inferidos',     (select count(*) from public.incident_events
                       where received_at >= now() - interval '1 hour' and origem_inferida),
    'pct_inferido',  (select round(100.0 * count(*) filter (where origem_inferida) / nullif(count(*), 0), 1)
                        from public.incident_events where received_at >= now() - interval '1 hour'),
    'por_origem', (
        select coalesce(jsonb_object_agg(x.origem, x.j), '{}'::jsonb) from (
            select coalesce(origem, 'nulo') as origem,
                   jsonb_build_object('total', count(*),
                                      'inferidos', count(*) filter (where origem_inferida)) as j
              from public.incident_events
             where received_at >= now() - interval '1 hour' group by 1) x));

select jsonb_pretty(jsonb_object_agg(chave, valor)) as relatorio from _placar;
