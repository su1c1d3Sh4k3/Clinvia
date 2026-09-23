-- Prova da segunda metade do item 2: o caminho do n8n (`incident_ingest`).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_chave_por_origem/depois_n8n.sql
--
-- POR QUE ESTE ARQUIVO EXISTE SEPARADO DO `depois.sql`
-- ====================================================
-- O `depois.sql` prova os 9 chamadores de `incident_record`. Erro de workflow do
-- n8n NAO passa por ele: entra por `incident_ingest`, que escreve direto nas
-- duas tabelas. A conferencia anterior dava tudo verde e esse caminho estava
-- gravando `nao_identificada` com `origem_inferida = FALSE` — palpite carimbado
-- como declaracao, que melhora o indicador do item 2 enquanto piora o dado.
--
-- Os dois controles abaixo sao o que impede o teste de se auto-enganar:
--   - `controle_omissao` insere DIRETO na tabela sem a coluna `origem`, para
--     provar que o default (`'nao_identificada'`, posto pela 20260923480000)
--     nao consegue mais se passar por declaracao;
--   - `prova_ingest` passa pela funcao de verdade, nao por um insert imitando
--     ela.
--
-- Tudo roda dentro da transacao unica do endpoint de SQL e e apagado antes do
-- commit: o cron `alert-dispatch`, que passa a cada minuto, nao chega a ver
-- nenhuma destas linhas.

create temp table _placar (chave text primary key, valor jsonb);

-- ── 1. prova estatica: os dois inserts da funcao declaram ───────────────────
-- Conta no corpo EM PRODUCAO. `incident_ingest` nao usa
-- `incident_record(jsonb_build_object(`, entao o contador do `depois.sql` nunca
-- olhou para ela — foi exatamente assim que o buraco passou.
insert into _placar
select 'declaracao_no_codigo', jsonb_build_object(
    'inserts_em_incident_x', (
        select (length(d.def) - length(replace(d.def, 'insert into public.incident', '')))
                   / length('insert into public.incident')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          join lateral (select pg_get_functiondef(p.oid) as def) d on true
         where n.nspname = 'public' and p.proname = 'incident_ingest'),
    'declaracoes_ia_n8n', (
        select (select count(*) from regexp_matches(d.def, '''ia_n8n''\s*,\s*false', 'g'))
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          join lateral (select pg_get_functiondef(p.oid) as def) d on true
         where n.nspname = 'public' and p.proname = 'incident_ingest'),
    'trigger_pega_nao_identificada', (
        select d.def like '%new.origem = ''nao_identificada''%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          join lateral (select pg_get_functiondef(p.oid) as def) d on true
         where n.nspname = 'public' and p.proname = 'incident_origem_normalizar'));

-- ── 2. controle: quem OMITE a coluna nao passa por declarado ────────────────
with ins as (
    insert into public.incident_events (source, component, error_message)
    values ('db_job', 'zz-teste:origem-omitida-coluna', 'controle do default')
    returning origem, origem_inferida
)
insert into _placar
select 'controle_omissao', jsonb_build_object(
    'origem',   (select origem from ins),
    'inferida', (select origem_inferida from ins),
    -- antes da 20260923570000 isto vinha `false`
    'ok_default_nao_finge_declaracao', (select origem_inferida from ins));

delete from public.incident_events where component = 'zz-teste:origem-omitida-coluna';

-- ── 3. prova por execucao: a funcao de verdade ──────────────────────────────
insert into _placar
select 'prova_ingest', public.incident_ingest(jsonb_build_object(
    'source',        'n8n_error',
    'workflow_id',   'zz-teste-workflow-origem',
    'workflow_name', 'zz-teste:ingest-origem',
    'failed_node',   'zz_origem:ingest',
    'error_message', 'prova de origem declarada no caminho do n8n'));

insert into _placar
select 'assercao_ingest', jsonb_build_object(
    'evento', (select jsonb_build_object('origem', origem, 'inferida', origem_inferida)
                 from public.incident_events where component = 'n8n:zz-teste:ingest-origem'),
    'incidente', (select jsonb_build_object('origem', origem, 'inferida', origem_inferida)
                    from public.incidents where component = 'n8n:zz-teste:ingest-origem'),
    'ok_evento_declarado_ia_n8n', (
        select origem = 'ia_n8n' and not origem_inferida
          from public.incident_events where component = 'n8n:zz-teste:ingest-origem'),
    'ok_incidente_declarado_ia_n8n', (
        select origem = 'ia_n8n' and not origem_inferida
          from public.incidents where component = 'n8n:zz-teste:ingest-origem'));

delete from public.incident_notifications n using public.incidents i
 where n.incident_id = i.id and i.component = 'n8n:zz-teste:ingest-origem';
delete from public.incident_events where component = 'n8n:zz-teste:ingest-origem';
delete from public.incidents      where component = 'n8n:zz-teste:ingest-origem';

insert into _placar
select 'limpeza', jsonb_build_object(
    'eventos_restantes', (select count(*) from public.incident_events
                           where component like '%zz-teste:%'),
    'incidentes_restantes', (select count(*) from public.incidents
                              where component like '%zz-teste:%'));

-- ── 4. medicao da janela nova ───────────────────────────────────────────────
-- A serie inteira segue em 99,1% e sempre seguira: `origem_inferida` e decidida
-- na escrita, e reescrever o passado para a meta fechar seria mentir sobre ele.
insert into _placar
select 'janela_nova', jsonb_build_object(
    'desde', 'ultima 1 hora',
    'eventos_total', (select count(*) from public.incident_events
                       where received_at >= now() - interval '1 hour'),
    'inferidos', (select count(*) from public.incident_events
                   where received_at >= now() - interval '1 hour' and origem_inferida),
    'por_origem', (
        select coalesce(jsonb_object_agg(x.origem, x.j), '{}'::jsonb) from (
            select origem, jsonb_build_object('total', count(*),
                       'inferidos', count(*) filter (where origem_inferida)) as j
              from public.incident_events
             where received_at >= now() - interval '1 hour' group by 1) x));

select jsonb_pretty(jsonb_object_agg(chave, valor)) as relatorio from _placar;
