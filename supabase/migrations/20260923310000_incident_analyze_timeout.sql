-- Timeout do invocador do analisador: 5s -> 60s.
--
-- ACHADO NA PRIMEIRA RODADA AO VIVO (23/09 12:56): a varredura analisou 5
-- incidentes em 19 segundos e funcionou — as analises estao gravadas. Mas
-- `clinvia_http_post` usa o default de 5000 ms do `net.http_post`, entao o
-- pg_net desistiu de esperar a resposta e gravou em `net._http_response`:
--     "Timeout of 5000 ms reached"
--
-- Isso cria um laco perverso: `cron_health_scan` le exatamente essa tabela e
-- transforma timeout em incidente 'cron-http:timeouts'. O analisador passaria a
-- abrir um incidente falso sobre si mesmo a cada 2 minutos — e cada incidente
-- falso consome uma analise, que demora mais, que estoura de novo. O
-- monitoramento viraria sua propria fonte de ruido.
--
-- Uma analise custa ~4s (chamada da OpenAI). Com lote de 5, o pior caso fica em
-- ~25s. 60s da folga sem mascarar travamento de verdade: se passar disso, a
-- function esta presa mesmo e o timeout e noticia legitima.
--
-- Por que nao baixar o lote em vez de subir o timeout: lote menor nao resolve
-- (1 analise ja passa de 5s) e deixaria a fila drenando devagar.

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
        p_body    := jsonb_build_object('action', 'scan', 'limit', 5),
        -- a chamada e sincrona e a IA leva ~4s por incidente
        p_timeout := 60000
    );
exception when others then
    raise warning 'invoke_incident_analyze: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_incident_analyze() from public, anon, authenticated;
grant execute on function public.invoke_incident_analyze() to service_role;
