-- Rollback de 20260923240000 (remocao do instagram-enrich-profiles).
--
-- ATENCAO: voltar atras NAO e "voltar ao que era", porque o que era estava quebrado.
-- O agendamento original apontava para `current_setting('app.settings.supabase_url')`,
-- GUC que nunca foi definida neste projeto — reagendar identico so devolve as 48
-- falhas por dia. Por isso este rollback reagenda ja pelo vault + clinvia_http_post,
-- como o resto do projeto.
--
-- Para reativar de verdade tambem e preciso reimplantar a edge function:
--   npx supabase functions deploy instagram-enrich-profiles

create or replace function public.invoke_instagram_enrich()
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
        p_alvo    := 'instagram-enrich-profiles',
        p_origem  := 'cron:instagram-enrich-profiles',
        p_url     := v_url || '/functions/v1/instagram-enrich-profiles',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('trigger', 'cron')
    );
exception when others then
    raise warning 'invoke_instagram_enrich: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_instagram_enrich() from public, anon, authenticated;
grant execute on function public.invoke_instagram_enrich() to service_role;

select cron.schedule('instagram-enrich-profiles', '*/30 * * * *',
                     $cmd$select public.invoke_instagram_enrich();$cmd$);
