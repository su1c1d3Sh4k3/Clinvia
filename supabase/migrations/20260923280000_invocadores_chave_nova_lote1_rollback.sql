-- Rollback de 20260923280000: devolve os tres invocadores ao JWT legado do vault
-- e ao net.http_post cru (sem rastro).
--
-- Reverter reintroduz os dois defeitos. Existe por disciplina do projeto.

create or replace function public.invoke_conversation_summary_worker()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url       text;
    v_key       text;
    v_pendentes integer;
begin
    select count(*) into v_pendentes from public.conversation_summary_queue where status = 'pending';
    if v_pendentes = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url     := v_url || '/functions/v1/conversation-summary-worker',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := '{}'::jsonb
    );
exception when others then
    raise notice 'conversation-summary-worker invoke error: %', sqlerrm;
end;
$$;

create or replace function public.invoke_delivery_automation_worker()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
declare
    enabled boolean;
    v_url   text;
    v_key   text;
begin
    select value into enabled from public.delivery_automation_flags where key = 'enabled';
    if not coalesce(enabled, false) then return; end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url     := v_url || '/functions/v1/delivery-automation-worker',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := '{}'::jsonb
    );
exception when others then
    raise notice 'delivery-automation worker error: %', sqlerrm;
end;
$$;

create or replace function public.invoke_auto_close_worker()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url     := v_url || '/functions/v1/auto-close-worker',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := '{}'::jsonb
    );
exception when others then
    raise notice 'auto-close-worker invoke error: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_conversation_summary_worker() from public, anon, authenticated;
revoke all on function public.invoke_delivery_automation_worker()  from public, anon, authenticated;
revoke all on function public.invoke_auto_close_worker()           from public, anon, authenticated;
grant execute on function public.invoke_conversation_summary_worker() to service_role;
grant execute on function public.invoke_delivery_automation_worker()  to service_role;
grant execute on function public.invoke_auto_close_worker()           to service_role;
