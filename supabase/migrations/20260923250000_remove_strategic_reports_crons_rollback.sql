-- Rollback de 20260923250000 (descontinuacao dos crons de strategic-reports).
--
-- Reagenda os tres nos MESMOS horarios de antes, mas sem repetir dois defeitos do
-- agendamento original (`20260311000001`, que so existe numa worktree):
--   1. a chave anon vinha CHAPADA dentro do comando do cron — aqui sai do vault;
--   2. o disparo era `net.http_post` cru, sem registro, entao um 401 voltaria a ser
--      anonimo para o cron-health-watch — aqui passa por clinvia_http_post.
--
-- Para voltar de verdade tambem e preciso reimplantar a edge function:
--   npx supabase functions deploy generate-strategic-reports
-- (o codigo-fonte dela NAO esta no repositorio principal, so em
--  .claude/worktrees/strange-archimedes/supabase/functions/generate-strategic-reports)

create or replace function public.invoke_strategic_reports(p_frequency text)
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
        p_alvo    := 'generate-strategic-reports',
        p_origem  := 'cron:strategic-reports-' || p_frequency,
        p_url     := v_url || '/functions/v1/generate-strategic-reports',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('frequency', p_frequency)
    );
exception when others then
    raise warning 'invoke_strategic_reports(%): %', p_frequency, sqlerrm;
end;
$$;

revoke all on function public.invoke_strategic_reports(text) from public, anon, authenticated;
grant execute on function public.invoke_strategic_reports(text) to service_role;

select cron.schedule('strategic-reports-daily',   '0 1 * * *',
                     $cmd$select public.invoke_strategic_reports('daily');$cmd$);
select cron.schedule('strategic-reports-weekly',  '0 1 * * 6',
                     $cmd$select public.invoke_strategic_reports('weekly');$cmd$);
select cron.schedule('strategic-reports-monthly', '0 1 1 * *',
                     $cmd$select public.invoke_strategic_reports('monthly');$cmd$);
