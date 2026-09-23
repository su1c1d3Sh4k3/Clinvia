-- Verificacao da migration 20260923260000 (conserto do instagram-refresh-tokens).
--
-- O que este arquivo prova, e o que ele NAO prova:
-- Ele confere o estado. A prova de que o caminho INTEIRO roda foi feita ao vivo em
-- 23/09/2026 10:53 BRT, forcando a conta clinbia.ai para dentro da janela de 15 dias
-- e rodando `instagram_refresh_tokens_run()`:
--     cron_http_calls   -> request 77578, alvo instagram-refresh-token
--     net._http_response-> HTTP 200, {"success":true,...,"expires_in_days":60}
--     instagram_instances -> clinbia.ai passou de 12/10/2026 para 22/11/2026
-- Ou seja: token renovado de verdade na conta de verdade, nao "migration aplicada".
--
-- Esperado:
--   cron usa a funcao       -> OK
--   cron sem GUC            -> OK (nenhum current_setting('app.settings...') no comando)
--   funcao existe           -> OK
--   funcao fechada          -> OK (anon e authenticated NAO executam)
--   nenhum token mentindo   -> OK (nada 'connected' com token vencido)
--   vencido tem incidente   -> OK ou '-' se nao houver conta vencida

with job as (
    select command, jobname from cron.job where jobname = 'instagram-refresh-tokens'
),
c1 as (
    select 'cron usa a funcao' as verificacao,
           coalesce((select left(command, 80) from job), '(job nao existe)') as detalhe,
           case when exists (select 1 from job where command ilike '%instagram_refresh_tokens_run%')
                then 'OK' else 'FALHOU' end as resultado
),
c2 as (
    select 'cron sem GUC' as verificacao,
           'app.settings.* no comando' as detalhe,
           case when exists (select 1 from job where command ilike '%app.settings.%')
                then 'FALHOU - ainda depende de GUC' else 'OK' end as resultado
),
c3 as (
    select 'funcao existe' as verificacao,
           'public.instagram_refresh_tokens_run()' as detalhe,
           case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'instagram_refresh_tokens_run')
                then 'OK' else 'FALHOU' end as resultado
),
c4 as (
    select 'funcao fechada' as verificacao,
           'anon/authenticated com EXECUTE?' as detalhe,
           case when exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'instagram_refresh_tokens_run'
                       and (has_function_privilege('anon', p.oid, 'EXECUTE')
                            or has_function_privilege('authenticated', p.oid, 'EXECUTE')))
                then 'FALHOU - executavel pelo front' else 'OK' end as resultado
),
c5 as (
    select 'nenhum token mentindo' as verificacao,
           coalesce(string_agg(i.account_name, ', '), '-') as detalhe,
           case when count(*) = 0 then 'OK'
                else 'FALHOU - ' || count(*) || ' conta(s) dizendo connected com token vencido' end as resultado
      from public.instagram_instances i
     where i.token_expires_at is not null and i.token_expires_at < now()
       and i.status is distinct from 'expired'
),
c6 as (
    select 'vencido tem incidente' as verificacao,
           coalesce(string_agg(distinct i.ai_severity, ', '), '-') as detalhe,
           case when (select count(*) from public.instagram_instances
                       where token_expires_at is not null and token_expires_at < now()) = 0
                     then 'OK - nao ha conta vencida'
                when count(*) > 0 then 'OK'
                else 'FALHOU - conta vencida sem incidente aberto' end as resultado
      from public.incidents i
     where i.component = 'instagram:token-vencido' and i.status <> 'resolved'
)
select * from c1
union all select * from c2
union all select * from c3
union all select * from c4
union all select * from c5
union all select * from c6;
