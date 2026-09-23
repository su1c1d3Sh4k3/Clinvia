-- Rollback de 20260923270000: volta invoke_campaign_dispatch ao estado anterior
-- (JWT legado do vault + net.http_post cru, sem rastro).
--
-- Reverter reintroduz os dois defeitos descritos na migration. Este arquivo
-- existe pela regra do projeto (toda migration de seguranca vem com rollback),
-- nao porque haja motivo bom para usa-lo. O unico cenario plausivel: a chave
-- nova ser revogada por engano e o gateway passar a recusa-la — nesse caso o
-- certo e consertar o segredo no vault, nao voltar para o JWT legado.

create or replace function public.invoke_campaign_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
begin
    if not exists (
        select 1 from public.campaigns
         where status = 'dispatching'
            or (status in ('scheduled','awaiting_template') and scheduled_at <= now())
    ) then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url     := v_url || '/functions/v1/campaign-dispatch',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body    := '{}'::jsonb
    );
exception when others then
    raise notice 'campaign-dispatch invoke error: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_campaign_dispatch() from public, anon, authenticated;
grant execute on function public.invoke_campaign_dispatch() to service_role;
