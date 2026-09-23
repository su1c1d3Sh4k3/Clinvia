-- Rollback de 20260923310000_incident_analyze_timeout.sql
--
-- CONSEQUENCIA DE RODAR ISTO: a analise continua acontecendo normalmente (a
-- edge function nao depende de o pg_net esperar a resposta), mas cada rodada
-- volta a ser gravada como "Timeout of 5000 ms reached" em net._http_response,
-- e o cron_health_scan volta a abrir incidente falso 'cron-http:timeouts' sobre
-- o proprio analisador de 2 em 2 minutos.
--
-- So faz sentido rodar isto se o timeout de 60s estiver segurando conexao do
-- pg_net a ponto de atrapalhar outra coisa. Nesse caso, a saida melhor e baixar
-- o lote (p_body limit) junto, nao voltar o timeout sozinho.

create or replace function public.invoke_incident_analyze()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url    text;
    v_jwt    text;
    v_edge   text;
    v_ligado boolean;
begin
    select coalesce(s.alert_analyze_enabled, true) into v_ligado
      from public.llm_platform_settings s limit 1;
    if v_ligado is false then
        return;
    end if;

    if public.incident_analyze_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'incident-analyze',
        p_origem  := 'cron:incident-analyze-scan',
        p_url     := v_url || '/functions/v1/incident-analyze',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('action', 'scan', 'limit', 5)
    );
exception when others then
    raise warning 'invoke_incident_analyze: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_incident_analyze() from public, anon, authenticated;
grant execute on function public.invoke_incident_analyze() to service_role;
