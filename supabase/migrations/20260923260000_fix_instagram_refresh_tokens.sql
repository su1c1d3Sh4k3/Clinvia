-- Conserto do cron `instagram-refresh-tokens` (item 4 da fila de 23/09/2026).
--
-- TRES DEFEITOS NO AGENDAMENTO DE 20260805150000, NAO UM:
--
-- 1. GUC INEXISTENTE. O comando montava a URL com
--    `current_setting('app.settings.supabase_url', true)`. Essa GUC nunca foi
--    definida neste projeto, e o `true` faz current_setting devolver NULL em vez
--    de erro. `NULL || '/functions/v1/...'` e NULL, e `net.http_post(url := NULL)`
--    viola o not-null da fila do pg_net. Mesmo defeito do instagram-enrich-profiles.
--
-- 2. SUCESSO VAZIO. O `where` exigia `token_expires_at > NOW()`. A unica instancia
--    dentro da janela de 15 dias tinha vencido em 05/07/2026 — 80 dias atras. Como
--    o `select` nao casava nenhuma linha, `net.http_post` nao era chamado NENHUMA
--    vez, e o pg_cron gravava `succeeded`. Foi assim que o defeito 1 nunca apareceu:
--    a instrucao quebrada nunca chegou a ser executada. Este e o caso concreto do
--    buraco de cobertura do vigia — job verde que nao faz nada.
--
-- 3. MUDO QUANDO IMPORTA. Token do Instagram so pode ser renovado ENQUANTO vale.
--    Depois de vencido a unica saida e reconectar por OAuth, na mao. Nao havia
--    nenhum aviso disso em lugar nenhum: a conta simplesmente parava.
--
-- O QUE MUDA AQUI:
--   - o disparo sai do comando do cron e vira funcao, lendo URL e chave do vault;
--   - vai por `clinvia_http_post`, entao um 401 futuro tem nome no painel;
--   - o alcance passa a ser toda instancia com token valido vencendo em ate 15 dias,
--     independente do `status` da linha (uma linha marcada 'expired' por engano
--     ainda tem token bom e ainda pode ser salva);
--   - quem ja venceu e marcado 'expired' toda passada, nao so uma vez;
--   - a passada devolve jsonb com o que fez, e isso vai para o log do job.
--
-- REGRA DE RUIDO (deliberada): so vira incidente quando o ESTADO MENTE.
--   status 'connected' + token vencido -> a tela diz que esta no ar e nao esta -> alta.
--   status 'expired'   + token vencido -> a tela ja conta a verdade -> media (nao
--   dispara WhatsApp, so soma na pagina de alertas).

create or replace function public.instagram_refresh_tokens_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url       text;
    v_jwt       text;
    v_edge      text;
    v_reg       record;
    v_res       jsonb;
    v_enviados  integer := 0;
    v_expirados integer := 0;
    v_mentindo  integer := 0;
    v_saudaveis integer := 0;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    if v_url is null then
        raise exception 'SUPABASE_URL ausente no vault — nao da para chamar a edge function';
    end if;

    -- ── 1. quem ainda da para salvar ─────────────────────────────────────────
    -- Sem filtro por status: o que decide e o token, nao o rotulo da linha.
    for v_reg in
        select i.id, i.account_name, i.token_expires_at
          from public.instagram_instances i
         where i.access_token is not null
           and i.token_expires_at is not null
           and i.token_expires_at > now()
           and i.token_expires_at < now() + interval '15 days'
         order by i.token_expires_at
    loop
        perform public.clinvia_http_post(
            p_alvo    := 'instagram-refresh-token',
            p_origem  := 'cron:instagram-refresh-tokens',
            p_url     := v_url || '/functions/v1/instagram-refresh-token',
            p_headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
                'x-service-key', coalesce(v_edge, v_jwt)
            ),
            p_body    := jsonb_build_object('instance_id', v_reg.id)
        );
        v_enviados := v_enviados + 1;
    end loop;

    -- ── 2. quem ja passou do ponto ───────────────────────────────────────────
    -- Renovar e impossivel; o que da para fazer e parar de mentir na tela.
    for v_reg in
        select i.id, i.account_name, i.status, i.token_expires_at
          from public.instagram_instances i
         where i.token_expires_at is not null
           and i.token_expires_at < now()
    loop
        v_expirados := v_expirados + 1;

        if v_reg.status is distinct from 'expired' then
            v_mentindo := v_mentindo + 1;
            update public.instagram_instances
               set status = 'expired', updated_at = now()
             where id = v_reg.id;
        end if;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'instagram:token-vencido',
                'route', v_reg.account_name,
                'error_message', 'Token do Instagram da conta @' || coalesce(v_reg.account_name, '(sem nome)')
                              || ' venceu e nao pode mais ser renovado. So reconectando por OAuth.',
                'error_description', 'Venceu em ' || to_char(v_reg.token_expires_at at time zone 'America/Sao_Paulo',
                                                             'DD/MM/YYYY HH24:MI') || ' (horario de Brasilia). '
                                  || 'A API do Instagram so renova token que ainda vale.',
                'context', jsonb_build_object('instance_id', v_reg.id,
                                              'status_antes', v_reg.status,
                                              'expirou_em', v_reg.token_expires_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                -- Ver "REGRA DE RUIDO" no cabecalho.
                if v_reg.status is distinct from 'expired' then
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
                    perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'alta');
                else
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
                end if;
            end if;
        exception when others then
            raise warning '[ig-refresh] incidente da conta %: %', v_reg.account_name, sqlerrm;
        end;
    end loop;

    select count(*) into v_saudaveis
      from public.instagram_instances i
     where i.token_expires_at is not null
       and i.token_expires_at >= now() + interval '15 days';

    return jsonb_build_object(
        'enviados_para_renovar', v_enviados,
        'ja_vencidos', v_expirados,
        'estavam_mentindo_connected', v_mentindo,
        'fora_da_janela_ok', v_saudaveis,
        'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    );
end;
$$;

comment on function public.instagram_refresh_tokens_run() is
  'Renova token do Instagram que vence em ate 15 dias e denuncia o que ja venceu. Substitui o comando inline do cron, que dependia da GUC app.settings.supabase_url — nunca definida neste projeto.';

revoke all on function public.instagram_refresh_tokens_run() from public, anon, authenticated;
grant execute on function public.instagram_refresh_tokens_run() to service_role;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'instagram-refresh-tokens') then
        perform cron.unschedule('instagram-refresh-tokens');
    end if;
end $$;

-- 04:15 UTC = 01:15 BRT, mesmo horario de antes.
select cron.schedule('instagram-refresh-tokens', '15 4 * * *',
                     $cmd$select public.instagram_refresh_tokens_run();$cmd$);
