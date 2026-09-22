-- Etapa "projeto e chave OpenAI por conta": os dois crons.
--
-- Numerada 261500 de proposito: a 262000 (interruptor `provisioning_enabled`)
-- continua sendo o ULTIMO arquivo da etapa.
--
-- Por que os crons entram antes do interruptor sem risco:
--   - `invoke_openai_provision_worker` nao chama a edge function enquanto
--     `llm_platform_settings.provisioning_enabled = false` OU a fila estiver
--     vazia. Hoje as duas coisas sao verdade ⇒ zero requisicao.
--   - `invoke_openai_usage_sync` nao chama nada enquanto nenhuma conta tiver
--     `openai_project_id`. Hoje nenhuma tem ⇒ zero requisicao.
-- Ou seja: o agendamento fica pronto e inerte, e ligar a etapa depois nao exige
-- mexer em cron nenhum.
--
-- Padrao copiado de `invoke_conversation_summary_worker`: segredos do vault
-- (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) e guarda de "tem trabalho?"
-- antes do `net.http_post`, para o cron de 1 em 5 minutos nao bater na funcao
-- de graca.

create or replace function public.invoke_openai_provision_worker()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
    v_pendentes integer;
    v_enabled boolean;
begin
    select coalesce(provisioning_enabled, false) into v_enabled
    from public.llm_platform_settings
    limit 1;

    if not coalesce(v_enabled, false) then
        return;
    end if;

    select count(*) into v_pendentes
    from public.openai_provision_queue
    where status = 'pending';

    if v_pendentes = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/openai-provision-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
exception when others then
    raise notice 'openai-provision-worker invoke error: %', sqlerrm;
end $$;

comment on function public.invoke_openai_provision_worker() is
    'Cron: chama a edge function openai-provision-worker. Silencioso enquanto provisioning_enabled = false ou a fila estiver vazia.';

create or replace function public.invoke_openai_usage_sync(p_since_days integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
    v_projetos integer;
begin
    -- Sem projeto na OpenAI nao existe consumo real para puxar: o painel mostra
    -- "estimado" e a Costs API nao tem o que devolver.
    select count(*) into v_projetos
    from public.profiles
    where openai_project_id is not null;

    if v_projetos = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/sync-openai-usage',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := case
            when p_since_days is null then '{}'::jsonb
            else jsonb_build_object('sinceDays', p_since_days)
        end
    );
exception when others then
    raise notice 'sync-openai-usage invoke error: %', sqlerrm;
end $$;

comment on function public.invoke_openai_usage_sync(integer) is
    'Cron: chama a edge function sync-openai-usage. p_since_days = janela curta (hora a hora); null = mes corrente inteiro (diario).';

revoke all on function public.invoke_openai_provision_worker() from anon, authenticated;
revoke all on function public.invoke_openai_usage_sync(integer) from anon, authenticated;

select cron.unschedule('openai-provision-worker')
where exists (select 1 from cron.job where jobname = 'openai-provision-worker');

select cron.unschedule('openai-usage-sync-hourly')
where exists (select 1 from cron.job where jobname = 'openai-usage-sync-hourly');

select cron.unschedule('openai-usage-sync-daily')
where exists (select 1 from cron.job where jobname = 'openai-usage-sync-daily');

select cron.schedule(
    'openai-provision-worker',
    '*/5 * * * *',
    $$select public.invoke_openai_provision_worker()$$
);

-- Hora a hora, janela de 2 dias: barato e mantem o "atualizado em" fresco.
select cron.schedule(
    'openai-usage-sync-hourly',
    '20 * * * *',
    $$select public.invoke_openai_usage_sync(2)$$
);

-- Uma vez por dia o mes inteiro, porque a OpenAI fecha custo com atraso e um
-- dia antigo pode mudar depois de ja ter sido coletado.
select cron.schedule(
    'openai-usage-sync-daily',
    '40 4 * * *',
    $$select public.invoke_openai_usage_sync(null)$$
);
