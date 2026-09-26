-- Catraca: nenhum job de cron carrega segredo em texto puro
-- ==========================================================
-- `cron.job` nao tem RLS e `command` e texto. Credencial escrita ali esta tao
-- exposta quanto um comentario, e nao aparece em nenhuma varredura de codigo
-- porque nao mora no repositorio. Ate 26/09/2026 tres jobs guardavam o JWT
-- service_role e a SCHEDULING_API_KEY assim.
--
-- E1 e a catraca de verdade: vale para job NOVO tambem, sem precisar cita-lo.
-- Os demais fixam o conserto dos tres para que uma reemissao nao o apague.
--
-- Nenhum valor de segredo aparece nesta saida: so contagens e nomes de job.

set lock_timeout = '5s';
set statement_timeout = '120s';

with suspeitos as (
    select jobname,
           command ~ 'eyJ[A-Za-z0-9._-]{20,}'                              as jwt,
           command ~ 'sb_secret_[A-Za-z0-9]'                               as sb_secret,
           command ~ 'sk-[A-Za-z0-9_-]{20,}'                               as sk,
           command ~* 'bearer\s+[A-Za-z0-9._-]{20,}'                       as bearer,
           command ~* '(x-)?api[-_]?key"?\s*[:=]+\s*"[A-Za-z0-9._-]{16,}"'  as apikey,
           command ~* 'token"?\s*[:=]+\s*"[A-Za-z0-9._-]{20,}"'            as token
      from cron.job
),
sujos as (
    select jobname from suspeitos
     where jwt or sb_secret or sk or bearer or apikey or token
),
alvo as (
    select jobname, schedule, active, command
      from cron.job
     where jobname in ('appointment-reminders','daily-summary-notification','check-reminders')
)
select 'E1' as etapa,
       'nenhum job de cron com segredo em texto puro' as verificacao,
       coalesce(string_agg(jobname, ', ' order by jobname), '(nenhum)') as achado,
       case when count(*) = 0 then 'ok' else 'CONFERIR' end as status
  from sujos

union all
select 'E2',
       'os tres jobs existem e estao ativos',
       count(*) filter (where active)::text || ' de 3',
       case when count(*) filter (where active) = 3 then 'ok' else 'CONFERIR' end
  from alvo

union all
select 'E3',
       'schedule preservado (nao foi realocado sem querer)',
       string_agg(jobname || '=' || schedule, ', ' order by jobname),
       case when count(*) filter (
              where (jobname = 'appointment-reminders'      and schedule = '6-59/10 * * * *')
                 or (jobname = 'daily-summary-notification' and schedule = '0 11 * * *')
                 or (jobname = 'check-reminders'            and schedule = '* * * * *')) = 3
            then 'ok' else 'CONFERIR' end
  from alvo

union all
select 'E4',
       'os tres leem a credencial de vault.decrypted_secrets',
       count(*) filter (where command ~* 'vault\.decrypted_secrets')::text || ' de 3',
       case when count(*) filter (where command ~* 'vault\.decrypted_secrets') = 3
            then 'ok' else 'CONFERIR' end
  from alvo

union all
select 'E5',
       'SCHEDULING_API_KEY esta no vault',
       case when count(*) = 1 then 'presente' else 'ausente' end,
       case when count(*) = 1 then 'ok' else 'CONFERIR' end
  from vault.decrypted_secrets where name = 'SCHEDULING_API_KEY'

union all
select 'E6',
       'os tres chamam clinvia_http_post (registram request_id p/ o cron-health-watch)',
       count(*) filter (where command ~* 'clinvia_http_post')::text || ' de 3',
       case when count(*) filter (where command ~* 'clinvia_http_post') = 3
            then 'ok' else 'CONFERIR' end
  from alvo

union all
-- Pendencia registrada de proposito: nao e reprovacao, e memoria. Vira
-- 'medicao' para nao travar a suite e nao sumir do radar.
select 'E7',
       'PENDENTE: service_role ainda e o JWT legado (migrar p/ sb_secret_)',
       case when exists (select 1 from vault.decrypted_secrets
                          where name = 'SUPABASE_SERVICE_ROLE_KEY'
                            and decrypted_secret like 'eyJ%')
            then 'ainda legado' else 'ja migrado' end,
       'medicao';
