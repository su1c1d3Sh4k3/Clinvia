-- Rollback de 20260926120000_segredo_no_cron
-- ==========================================
-- Devolve os tres jobs ao formato anterior, com a credencial interpolada no
-- corpo do comando. Os valores vem do vault e sao montados por `format()`
-- dentro do banco — este arquivo continua sem segredo nenhum.
--
-- A SCHEDULING_API_KEY NAO e removida do vault: apagar a linha deixaria o
-- segredo existindo so no texto do cron de novo, que e exatamente o defeito
-- que a migration consertou. Para remover de verdade, a mao:
--     select vault.delete_secret(id) from vault.secrets where name = 'SCHEDULING_API_KEY';

set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
declare
    v_jwt  text;
    v_akey text;
begin
    select decrypted_secret into v_jwt
      from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_akey
      from vault.decrypted_secrets where name = 'SCHEDULING_API_KEY' limit 1;

    if v_jwt is null or v_akey is null then
        raise exception 'vault nao tem SUPABASE_SERVICE_ROLE_KEY e/ou SCHEDULING_API_KEY — rollback abortado';
    end if;

    perform cron.unschedule('appointment-reminders')
      where exists (select 1 from cron.job where jobname = 'appointment-reminders');
    perform cron.unschedule('daily-summary-notification')
      where exists (select 1 from cron.job where jobname = 'daily-summary-notification');
    perform cron.unschedule('check-reminders')
      where exists (select 1 from cron.job where jobname = 'check-reminders');

    perform cron.schedule('appointment-reminders', '6-59/10 * * * *', format($f$
    SELECT
      net.http_post(
          url:='https://swfshqvvbohnahdyndch.supabase.co/functions/v1/scheduler-notifications',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer %s", "x-api-key": "%s"}'::jsonb,
          body:='{"action": "check_reminders"}'::jsonb
      ) as request_id;
    $f$, v_jwt, v_akey));

    perform cron.schedule('daily-summary-notification', '0 11 * * *', format($f$
    SELECT
      net.http_post(
          url:='https://swfshqvvbohnahdyndch.supabase.co/functions/v1/scheduler-notifications',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer %s", "x-api-key": "%s"}'::jsonb,
          body:='{"action": "daily_summary"}'::jsonb
      ) as request_id;
    $f$, v_jwt, v_akey));

    perform cron.schedule('check-reminders', '* * * * *', format($f$
  SELECT net.http_post(
    url := 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/check-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer %s"}'::jsonb,
    body := '{}'::jsonb
  );
  $f$, v_jwt));
end $$;
