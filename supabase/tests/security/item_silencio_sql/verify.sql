-- Item 3, metade SQL: prova de que o fallback continua e o silencio acabou.
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_silencio_sql/verify.sql
--
-- COMO LER
-- ========
-- Nao ha `antes.sql` rodavel aqui: o estado anterior e a AUSENCIA de um campo,
-- e depois de aplicada a 20260923580000 nao da para reproduzi-lo sem reverter a
-- funcao em producao. A linha de base medida em 23/09, antes da mudanca, era:
--
--     incident_record          2 handlers `-> null`, 0 registravam
--     incident_ingest          1 handler  `-> null`, 0 registravam
--     admin_delete_tenant_data 3 handlers `-> null`, 0 registravam
--
-- O que o teste faz no lugar: prova as DUAS metades da instrucao ("mantenha o
-- fallback, mas faca registrar"). Provar so o registro seria meia prova — um
-- handler que agora ESTOURA em vez de engolir tambem faria o aviso aparecer...
-- e derrubaria a ingestao, que e exatamente o que o fallback existe para evitar.
-- Por isso cada assercao confere as duas coisas na mesma linha: o aviso ESTA la
-- E o evento nasceu assim mesmo.
--
-- `admin_delete_tenant_data` so tem prova estatica, de proposito: exercitar os
-- handlers dela exige uma exclusao de conta real (a funcao apaga o tenant
-- inteiro; o `p_dry_run` retorna ANTES do laco e nao passa perto deles). Nao ha
-- tenant descartavel — o de teste foi excluido em 22/09 — e inventar um para
-- isto seria criar o risco que o teste deveria evitar.
--
-- Componente `zz-teste:` (familia somente_painel), tudo dentro da transacao
-- unica do endpoint de SQL e apagado antes do commit: o cron `alert-dispatch`,
-- que passa a cada minuto, nao chega a ver estas linhas.

create temp table _placar (chave text primary key, valor jsonb);

-- ── 1. incident_record: id e data ilegiveis ─────────────────────────────────
insert into _placar
select 'retorno_record', public.incident_record(jsonb_build_object(
    'origem',        'cron',
    'source',        'db_job',
    'component',     'zz-teste:silencio-record',
    'failed_node',   'zz_silencio:record',
    'error_message', 'prova de valor ilegivel registrado',
    'owner_id',      'isto-nao-e-um-uuid',
    'started_at',    '31 de fevereiro',
    'http_code',     200));

insert into _placar
select 'assercao_record', jsonb_build_object(
    'context', (select context from public.incident_events
                 where component = 'zz-teste:silencio-record'),
    -- o fallback continua: os dois campos viraram nulo em vez de derrubar
    'ok_fallback_owner_nulo', (
        select owner_id is null from public.incident_events
         where component = 'zz-teste:silencio-record'),
    'ok_fallback_started_nulo', (
        select started_at is null from public.incident_events
         where component = 'zz-teste:silencio-record'),
    -- e agora deixa rastro dos dois
    'ok_registra_owner', (
        select context ? 'aviso_owner_id' from public.incident_events
         where component = 'zz-teste:silencio-record'),
    'ok_registra_started', (
        select context ? 'aviso_started_at' from public.incident_events
         where component = 'zz-teste:silencio-record'),
    -- o valor recusado aparece cortado, nao inteiro
    'ok_aviso_curto', (
        select length(context ->> 'aviso_owner_id') <= 160 from public.incident_events
         where component = 'zz-teste:silencio-record'));

-- ── 2. controle: payload limpo nao ganha aviso nenhum ───────────────────────
-- Sem este controle o teste aceitaria uma funcao que carimba aviso sempre, o
-- que poluiria o context de todo evento saudavel.
insert into _placar
select 'retorno_limpo', public.incident_record(jsonb_build_object(
    'origem',        'cron',
    'source',        'db_job',
    'component',     'zz-teste:silencio-limpo',
    'failed_node',   'zz_silencio:limpo',
    'error_message', 'controle: payload sem valor podre',
    'started_at',    '2026-09-23T12:00:00Z',
    'http_code',     200));

insert into _placar
select 'assercao_controle', jsonb_build_object(
    'context', (select context from public.incident_events
                 where component = 'zz-teste:silencio-limpo'),
    'ok_sem_aviso', (
        select not (context ? 'aviso_owner_id') and not (context ? 'aviso_started_at')
          from public.incident_events where component = 'zz-teste:silencio-limpo'),
    'ok_started_preservado', (
        select started_at = '2026-09-23T12:00:00Z'::timestamptz
          from public.incident_events where component = 'zz-teste:silencio-limpo'));

-- ── 3. incident_ingest: data podre vinda do n8n ─────────────────────────────
insert into _placar
select 'retorno_ingest', public.incident_ingest(jsonb_build_object(
    'source',        'n8n_error',
    'workflow_id',   'zz-teste-workflow-silencio',
    'workflow_name', 'zz-teste:silencio-ingest',
    'failed_node',   'zz_silencio:ingest',
    'error_message', 'prova de data podre registrada',
    'started_at',    'ontem de tarde'));

insert into _placar
select 'assercao_ingest', jsonb_build_object(
    'context', (select context from public.incident_events
                 where component = 'n8n:zz-teste:silencio-ingest'),
    'ok_fallback_started_nulo', (
        select started_at is null from public.incident_events
         where component = 'n8n:zz-teste:silencio-ingest'),
    'ok_registra_started', (
        select context ? 'aviso_started_at' from public.incident_events
         where component = 'n8n:zz-teste:silencio-ingest'),
    -- de quebra: a origem declarada da 20260923570000 segue de pe
    'ok_origem_declarada', (
        select origem = 'ia_n8n' and not origem_inferida from public.incident_events
         where component = 'n8n:zz-teste:silencio-ingest'));

-- ── 4. admin_delete_tenant_data: prova estatica no corpo em producao ────────
-- DUAS ARMADILHAS JA PEGAS AQUI, as duas do mesmo tipo (o teste lendo COMENTARIO
-- como se fosse codigo):
--   - contar `when others` por substring achava 4 handlers onde ha 3: o quarto
--     era a palavra dentro do comentario que eu mesmo escrevi na migration
--     ("os tres `when others` abaixo"). O contador so vale ancorado no inicio
--     da linha, onde comentario nao chega;
--   - conferir o fallback por frase (`like '%tenta de novo na proxima
--     passada%'`) dava falso negativo porque a frase passou a quebrar linha.
--     Frase e formatacao; o que importa e a semantica: handler que NAO reergue.
insert into _placar
select 'assercao_delete_estatica', (
    select jsonb_build_object(
        'handlers', (
            select count(*) from regexp_matches(
                d.def, '(?m)^\s+when (others|foreign_key_violation) then\s*$', 'g')),
        'registros_em_del_falha', (
            select count(*) from regexp_matches(d.def, 'insert into _del_falha', 'g')),
        'ok_todo_handler_registra', (
            (select count(*) from regexp_matches(d.def, 'insert into _del_falha', 'g'))
            = (select count(*) from regexp_matches(
                   d.def, '(?m)^\s+when (others|foreign_key_violation) then\s*$', 'g'))),
        'ok_excecao_diz_motivo', (
            (select count(*) from regexp_matches(d.def, '-- motivo: %', 'g')) = 2),
        -- o fallback e o handler NAO reerguer: se ele passasse a `raise`, o
        -- aviso apareceria e a exclusao pararia — metade certa, metade errada.
        'ok_handler_nao_reergue', (
            (select count(*) from regexp_matches(
                d.def, '(?m)^\s+when (others|foreign_key_violation) then\s*\n(\s*--[^\n]*\n)*\s*raise', 'g')) = 0),
        'ok_sem_null_solto', (
            -- nenhum `then -> null;` sobrou como unica acao de handler
            (select count(*) from regexp_matches(
                d.def, '(?m)^\s+when (others|foreign_key_violation) then\s*\n(\s*--[^\n]*\n)*\s*null;', 'g')) = 0))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      join lateral (select pg_get_functiondef(p.oid) as def) d on true
     where n.nspname = 'public' and p.proname = 'admin_delete_tenant_data');

-- ── 5. limpeza ──────────────────────────────────────────────────────────────
delete from public.incident_notifications n using public.incidents i
 where n.incident_id = i.id and i.component like '%zz-teste:silencio-%';
delete from public.incident_events where component like '%zz-teste:silencio-%';
delete from public.incidents      where component like '%zz-teste:silencio-%';

insert into _placar
select 'limpeza', jsonb_build_object(
    'eventos_restantes',    (select count(*) from public.incident_events
                              where component like '%zz-teste%'),
    'incidentes_restantes', (select count(*) from public.incidents
                              where component like '%zz-teste%'));

select jsonb_pretty(jsonb_object_agg(chave, valor)) as relatorio from _placar;
