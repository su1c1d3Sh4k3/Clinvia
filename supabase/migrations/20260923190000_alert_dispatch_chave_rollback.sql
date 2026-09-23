-- Rollback de 20260923190000_alert_dispatch_chave.sql
--
-- ATENÇÃO: reverter devolve o despachante ao estado em que o cron dizia
-- "succeeded" e a Meta nunca era chamada (401 silencioso). Só faça isso se a
-- chave nova estiver causando dano ativo.
--
-- DESLIGAR SEM REVERTER:
--   select cron.unschedule('alert-dispatch');
--
-- Para tirar só a chave nova de circulação, sem mexer no código:
--   select vault.delete_secret(id) from vault.secrets where name = 'SUPABASE_EDGE_SECRET_KEY';
-- A função cai sozinha no JWT antigo (coalesce) — e volta a dar 401, que é o
-- comportamento que esta migration corrigiu.

create or replace function public.invoke_alert_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
begin
    if public.incident_notify_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/alert-notify',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('action', 'dispatch')
    );
exception when others then
    raise warning 'invoke_alert_dispatch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_dispatch() from public, anon, authenticated;
