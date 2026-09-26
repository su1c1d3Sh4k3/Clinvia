-- Segredo em texto puro no corpo do job de cron
-- =============================================
-- Tres jobs guardavam credencial legivel por qualquer um que consultasse
-- `cron.job`: o JWT service_role legado no header Authorization e, em dois
-- deles, a SCHEDULING_API_KEY no x-api-key. `cron.job` nao tem RLS e o comando
-- e texto; o segredo estava tao exposto quanto um comentario.
--
--   appointment-reminders        6-59/10 * * * *   service_role + SCHEDULING_API_KEY
--   daily-summary-notification   0 11 * * *        service_role + SCHEDULING_API_KEY
--   check-reminders              * * * * *         service_role
--
-- O valor da SCHEDULING_API_KEY e copiado do proprio comando para o vault DENTRO
-- do banco: nao passa por este arquivo, por um log nem por um relatorio.
--
-- Aproveita para trocar `net.http_post` por `public.clinvia_http_post`, que
-- registra o request_id em cron_http_calls — sem isso o `cron-health-watch` nao
-- consegue nomear a falha (net._http_response nao guarda URL e e podado em
-- 30 min), e o job segue dizendo `succeeded` para uma chamada recusada.
--
-- PENDENCIA REGISTRADA, NAO EXECUTADA NESTA MIGRATION: o service_role continua
-- sendo o JWT legado (`eyJ…`, 219 chars). A troca pelas chaves novas do Supabase
-- (`sb_secret_…`) e um movimento a parte — ver docs/security/ESTADO_ATUAL.md.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ── 1. A SCHEDULING_API_KEY sai do comando e vai para o vault ───────────────
do $$
declare
    v_chave text;
begin
    if exists (select 1 from vault.decrypted_secrets where name = 'SCHEDULING_API_KEY') then
        raise notice 'SCHEDULING_API_KEY ja estava no vault — nada a criar';
        return;
    end if;

    select (regexp_match(command, '"x-api-key"\s*:\s*"([^"]+)"'))[1]
      into v_chave
      from cron.job
     where jobname = 'appointment-reminders';

    -- Falhar aqui e o certo: seguir em frente reescreveria o job sem a chave e
    -- o scheduler-notifications passaria a recusar todo lembrete, em silencio.
    if v_chave is null or length(v_chave) < 16 then
        raise exception 'nao consegui extrair a SCHEDULING_API_KEY de appointment-reminders';
    end if;

    perform vault.create_secret(
        v_chave,
        'SCHEDULING_API_KEY',
        'Chave x-api-key das APIs de agenda. Movida para ca em 26/09/2026, quando saiu do texto puro de cron.job.');
end $$;

-- ── 2. Os tres jobs passam a ler do vault ───────────────────────────────────
do $$
begin
    perform cron.unschedule('appointment-reminders')
      where exists (select 1 from cron.job where jobname = 'appointment-reminders');

    perform cron.unschedule('daily-summary-notification')
      where exists (select 1 from cron.job where jobname = 'daily-summary-notification');

    perform cron.unschedule('check-reminders')
      where exists (select 1 from cron.job where jobname = 'check-reminders');
end $$;

select cron.schedule(
    'appointment-reminders',
    '6-59/10 * * * *',
    $cron$
    select public.clinvia_http_post(
        'scheduler-notifications',
        'appointment-reminders',
        'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/scheduler-notifications',
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                            where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1),
            'x-api-key', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'SCHEDULING_API_KEY' limit 1)),
        '{"action": "check_reminders"}'::jsonb);
    $cron$);

select cron.schedule(
    'daily-summary-notification',
    '0 11 * * *',
    $cron$
    select public.clinvia_http_post(
        'scheduler-notifications',
        'daily-summary-notification',
        'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/scheduler-notifications',
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                            where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1),
            'x-api-key', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'SCHEDULING_API_KEY' limit 1)),
        '{"action": "daily_summary"}'::jsonb);
    $cron$);

select cron.schedule(
    'check-reminders',
    '* * * * *',
    $cron$
    select public.clinvia_http_post(
        'check-reminders',
        'check-reminders',
        'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/check-reminders',
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                            where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)),
        '{}'::jsonb);
    $cron$);
