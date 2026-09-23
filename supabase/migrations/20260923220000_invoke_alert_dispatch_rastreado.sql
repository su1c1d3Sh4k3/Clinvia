-- O despachante passa a disparar por clinvia_http_post.
--
-- Mudanca minima e deliberadamente restrita a UMA funcao: a que quebrou.
-- `net._http_response` nao guarda a URL, entao sem este registro o proximo 401
-- do despachante voltaria a ser anonimo no painel — 'cron-http:http-desconhecido'
-- em vez de 'cron-http:alert-notify'. A chamada em si nao muda: mesmos headers,
-- mesmo corpo, mesmo destino. So ganha nome.
--
-- Os outros 19 invocadores migram depois, um a um, com aviso. Este foi primeiro
-- porque e o unico cujo fracasso apaga TODOS os outros alertas.

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
    -- de minuto em minuto, mas so acorda a edge function quando ha o que enviar
    if public.incident_notify_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'alert-notify',
        p_origem  := 'cron:alert-dispatch',
        p_url     := v_url || '/functions/v1/alert-notify',
        p_headers := jsonb_build_object(
            'Content-Type',   'application/json',
            -- gateway: aceita tanto o JWT antigo quanto a chave nova
            'Authorization',  'Bearer ' || coalesce(v_edge, v_jwt),
            -- a funcao: compara com o proprio SUPABASE_SERVICE_ROLE_KEY dela
            'x-service-key',  coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('action', 'dispatch')
    );
exception when others then
    raise warning 'invoke_alert_dispatch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_dispatch() from public, anon, authenticated;
grant execute on function public.invoke_alert_dispatch() to service_role;
