-- Remocao do instagram-enrich-profiles (decisao do dono, 23/09/2026).
--
-- POR QUE SAI, E NAO E CONSERTADO:
-- A tarefa `instagram-enrich-profiles` (jobid 22, a cada 30 min) foi agendada em
-- 20260506100000 apontando para `current_setting('app.settings.supabase_url')`. Essa
-- GUC NUNCA foi definida neste projeto, entao `net.http_post` recebia `url = NULL` e
-- morria com "null value in column url". Resultado: 100% de falha desde 06/05/2026 —
-- 140 dias, 52 execucoes falhas so nas ultimas 24h.
--
-- O QUE A FUNCAO FAZIA (auditado antes de remover):
--   le  -> public.instagram_instances (token da conta)
--   le  -> public.contacts (quem ainda nao tem @usuario no push_name)
--   Graph do Instagram -> username do perfil
--   escreve -> contacts.push_name = '@' || username
-- Nao existe tabela dedicada, nao existe coluna exclusiva dela, nao existe RPC,
-- nenhuma tela do front e nenhuma outra edge function chamam essa funcao.
-- Perda funcional de remover: contato do Direct continua com o push_name que veio
-- do proprio webhook do Instagram, em vez de ser reescrito para '@usuario'.
-- Como a tarefa nunca rodou com sucesso, nada muda na pratica.
--
-- A implantacao da edge function e removida fora daqui:
--   npx supabase functions delete instagram-enrich-profiles --project-ref swfshqvvbohnahdyndch

do $$
begin
    if exists (select 1 from cron.job where jobname = 'instagram-enrich-profiles') then
        perform cron.unschedule('instagram-enrich-profiles');
        raise notice 'cron instagram-enrich-profiles desagendado';
    else
        raise notice 'cron instagram-enrich-profiles ja nao existia';
    end if;
end $$;

-- Deixa de acusar como incidente um job que agora deixa de existir de proposito.
delete from public.cron_health_seen where jobname = 'instagram-enrich-profiles';

-- Fecha os incidentes ja abertos por ele: a causa foi removida, nao consertada.
update public.incidents
   set status = 'resolved',
       resolved_at = now(),
       updated_at = now(),
       notes = coalesce(notes || E'\n', '')
            || 'Fechado por 20260923240000: a tarefa instagram-enrich-profiles foi '
            || 'REMOVIDA (nao consertada) por decisao do dono em 23/09/2026.'
 where status <> 'resolved'
   and component = 'cron:instagram-enrich-profiles';
