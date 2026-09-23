-- Rollback de 20260923220000: volta ao net.http_post cru, sem registro do alvo.
-- Efeito colateral do rollback: um 401 do despachante volta a ser anonimo.

create or replace function public.invoke_alert_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    if public.incident_notify_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/alert-notify',
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            'Authorization',  'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key',  coalesce(v_edge, v_jwt)
        ),
        body := jsonb_build_object('action', 'dispatch')
    );
exception when others then
    raise warning 'invoke_alert_dispatch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_dispatch() from public, anon, authenticated;
grant execute on function public.invoke_alert_dispatch() to service_role;
