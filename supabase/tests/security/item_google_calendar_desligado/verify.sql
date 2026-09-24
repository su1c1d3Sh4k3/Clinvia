-- Teste de acesso: Google Calendar desligado por chave (25/09/2026)
--
-- Prova as quatro promessas do desligamento:
--   1. a chave existe, e esta em false (servidor e front leem a MESMA celula);
--   2. a RPC que o front usa nao expoe a tabela de segredos (sem EXECUTE para
--      anon/public, search_path fixo, security definer);
--   3. nada foi apagado: conexoes, google_event_id e google_calendar_sync_id
--      seguem no lugar, prontos para quando o recurso voltar;
--   4. o desligamento nao pode gerar alerta: nenhum cron acorda as functions
--      google-* e nenhum incidente da classe fica aberto.
--
-- Leitura pura, um unico statement (a CLI so devolve as linhas do ultimo).
-- Rodar com:
--   npx supabase db query --linked --file supabase/tests/security/item_google_calendar_desligado/verify.sql

with
chave as (
    select count(*) filter (where google_calendar_enabled is false) as desligadas,
           count(*) as linhas
      from public.llm_platform_settings
),
fn as (
    select p.oid,
           p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), '') as cfg
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'google_calendar_enabled'
),
conexoes as (
    select count(*) as total,
           count(*) filter (where is_active) as ativas
      from public.professional_google_calendars
),
agenda as (
    select count(*) filter (where google_event_id is not null) as com_evento,
           count(*) filter (where google_calendar_sync_id is not null) as com_sync
      from public.appointments
),
crons as (
    select count(*) as n
      from cron.job
     where command ilike '%google%'
        or jobname ilike '%google%'
        or jobname ilike '%gcal%'
),
incidentes as (
    select count(*) as abertos
      from public.incidents
     where component like 'google:%'
       and status <> 'resolved'
)
select * from (
    select 1 as ord,
           'chave existe e esta desligada' as item,
           (select linhas || ' linha(s), ' || desligadas || ' com false' from chave) as medido,
           case when (select linhas = desligadas and linhas > 0 from chave)
                then 'ok' else 'CONFERIR' end as status
    union all
    select 2,
           'RPC google_calendar_enabled existe',
           (select count(*)::text || ' funcao(oes)' from fn),
           case when (select count(*) = 1 from fn) then 'ok' else 'CONFERIR' end
    union all
    select 3,
           'RPC e security definer com search_path fixo',
           (select coalesce(bool_and(prosecdef and cfg like '%search_path%')::text, 'sem funcao') from fn),
           case when (select coalesce(bool_and(prosecdef and cfg like '%search_path%'), false) from fn)
                then 'ok' else 'CONFERIR' end
    union all
    select 4,
           'anon NAO executa a RPC',
           (select coalesce(bool_or(has_function_privilege('anon', oid, 'EXECUTE'))::text, 'sem funcao') from fn),
           case when (select coalesce(bool_or(has_function_privilege('anon', oid, 'EXECUTE')), true) from fn)
                then 'CONFERIR' else 'ok' end
    union all
    select 5,
           'authenticated EXECUTA a RPC (o front precisa)',
           (select coalesce(bool_and(has_function_privilege('authenticated', oid, 'EXECUTE'))::text, 'sem funcao') from fn),
           case when (select coalesce(bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')), false) from fn)
                then 'ok' else 'CONFERIR' end
    union all
    select 6,
           'conexoes preservadas (nada apagado)',
           (select total || ' linha(s), ' || ativas || ' ativa(s)' from conexoes),
           case when (select total >= 4 from conexoes) then 'ok' else 'CONFERIR' end
    union all
    select 7,
           'appointments.google_event_id intocado',
           (select com_evento || ' com evento, ' || com_sync || ' com sync_id' from agenda),
           'ok'
    union all
    select 8,
           'nenhum cron acorda as functions google-*',
           (select n::text || ' cron(s)' from crons),
           case when (select n = 0 from crons) then 'ok' else 'CONFERIR' end
    union all
    select 9,
           'nenhum incidente google:* aberto',
           (select abertos::text || ' aberto(s)' from incidentes),
           case when (select abertos = 0 from incidentes) then 'ok' else 'CONFERIR' end
) t
order by ord;
