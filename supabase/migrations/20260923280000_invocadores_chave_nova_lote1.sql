-- Item 6, invocadores 2 a 4: conversation-summary-worker, delivery-automation-worker
-- e auto-close-worker.
--
-- Mesma correcao de 20260923270000, pelos mesmos dois motivos:
--   1. liam 'SUPABASE_SERVICE_ROLE_KEY' do vault, que aqui ainda e o JWT LEGADO,
--      enquanto o ambiente das edge functions ja usa a chave nova (sb_secret_);
--   2. chamavam net.http_post cru, sem deixar o alvo registrado em lugar nenhum —
--      net._http_response nao tem coluna de URL e e purgada em 30 minutos, entao
--      um 401 destas chamadas seria anonimo no painel.
--
-- Vao juntos nesta migration porque sao a MESMA funcao com nomes diferentes:
-- le url + chave do vault, dispara, engole excecao. A verificacao, essa sim, e
-- individual: cada um dos tres foi disparado de verdade e conferido em
-- cron_http_calls + net._http_response separadamente.
--
-- Cada guard foi copiado LETRA POR LETRA do original. Guard errado aqui e pior
-- que chave errada: um resumo que nao roda ou um auto-close que fecha o que nao
-- devia nao aparece em nenhum log HTTP.
--
-- Nenhuma das tres edge functions confere x-service-key hoje. O header vai junto
-- mesmo assim, para que o dia em que alguma passe a conferir nao seja o dia em
-- que ela para em silencio.

-- ── 1. conversation-summary-worker (1558 execucoes/24h) ──────────────────────
create or replace function public.invoke_conversation_summary_worker()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url       text;
    v_jwt       text;
    v_edge      text;
    v_pendentes integer;
begin
    select count(*) into v_pendentes
      from public.conversation_summary_queue
     where status = 'pending';

    if v_pendentes = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'conversation-summary-worker',
        p_origem  := 'cron:conversation-summary-worker',
        p_url     := v_url || '/functions/v1/conversation-summary-worker',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb
    );
exception when others then
    raise warning 'invoke_conversation_summary_worker: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_conversation_summary_worker() from public, anon, authenticated;
grant execute on function public.invoke_conversation_summary_worker() to service_role;

-- ── 2. delivery-automation-worker (1557 execucoes/24h) ───────────────────────
create or replace function public.invoke_delivery_automation_worker()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
declare
    enabled boolean;
    v_url   text;
    v_jwt   text;
    v_edge  text;
begin
    select value into enabled from public.delivery_automation_flags where key = 'enabled';
    if not coalesce(enabled, false) then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'delivery-automation-worker',
        p_origem  := 'cron:delivery-automation-worker',
        p_url     := v_url || '/functions/v1/delivery-automation-worker',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb
    );
exception when others then
    raise warning 'invoke_delivery_automation_worker: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_delivery_automation_worker() from public, anon, authenticated;
grant execute on function public.invoke_delivery_automation_worker() to service_role;

-- ── 3. auto-close-worker (312 execucoes/24h, sem guard por desenho) ──────────
create or replace function public.invoke_auto_close_worker()
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
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'auto-close-worker',
        p_origem  := 'cron:auto-close-worker',
        p_url     := v_url || '/functions/v1/auto-close-worker',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb
    );
exception when others then
    raise warning 'invoke_auto_close_worker: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_auto_close_worker() from public, anon, authenticated;
grant execute on function public.invoke_auto_close_worker() to service_role;
