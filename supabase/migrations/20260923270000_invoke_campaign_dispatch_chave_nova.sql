-- Item 6 do plano, invocador 1 de 19: campaign-dispatch-worker.
--
-- Por que este primeiro: e o de maior frequencia real do projeto (1558 execucoes
-- em 24h, de minuto em minuto) e move dinheiro do cliente — campanha que nao
-- dispara e cliente que nao recebe.
--
-- O que estava errado (dois defeitos, nenhum deles visivel hoje):
--
--   1. Chave. A funcao lia o segredo 'SUPABASE_SERVICE_ROLE_KEY' do vault, que
--      neste projeto ainda guarda o JWT LEGADO (eyJ..., 219 chars), enquanto o
--      ambiente das edge functions ja foi migrado para a chave nova
--      (sb_secret_..., 41 chars). O gateway do Supabase aceita os DOIS formatos,
--      entao a chamada passa. So quebraria no dia em que a campaign-dispatch
--      passasse a conferir a chave contra o proprio env — que e exatamente o
--      defeito que derrubou a alert-notify por semanas sem ninguem ver.
--      Hoje a campaign-dispatch NAO faz essa conferencia (verificado no codigo:
--      ela le SUPABASE_SERVICE_ROLE_KEY so para montar o client, nunca compara
--      com header). Ou seja: isto e prevencao, nao conserto de algo quebrado.
--
--   2. Sem rastro. `net.http_post` cru nao registra o alvo em lugar nenhum, e
--      `net._http_response` NAO TEM coluna de URL e e purgada em 30 minutos.
--      Se esta chamada comecar a responder 401 ou 500, o cron-health-watch
--      consegue ver que existe uma resposta ruim, mas nao consegue dizer DE QUEM.
--      Passando por clinvia_http_post o request_id fica amarrado ao nome
--      'campaign-dispatch' em cron_http_calls, e a falha vira incidente com nome.
--
-- O que NAO muda: o guard (so acorda a edge function quando ha campanha
-- dispatching ou agendada vencida), o destino, o corpo, o horario, a captura de
-- excecao. A chamada e a mesma; ganha a chave certa e um nome.

create or replace function public.invoke_campaign_dispatch()
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
    -- de minuto em minuto, mas so acorda a edge function quando ha trabalho
    if not exists (
        select 1 from public.campaigns
         where status = 'dispatching'
            or (status in ('scheduled','awaiting_template') and scheduled_at <= now())
    ) then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'campaign-dispatch',
        p_origem  := 'cron:campaign-dispatch-worker',
        p_url     := v_url || '/functions/v1/campaign-dispatch',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            -- gateway: aceita o JWT antigo e a chave nova; mandamos a nova
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            -- se um dia a funcao passar a se auto-conferir, ja chega certo
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb
    );
exception when others then
    raise warning 'invoke_campaign_dispatch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_campaign_dispatch() from public, anon, authenticated;
grant execute on function public.invoke_campaign_dispatch() to service_role;
