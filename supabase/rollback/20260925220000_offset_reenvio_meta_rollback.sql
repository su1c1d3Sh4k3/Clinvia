-- Rollback de 20260925220000_offset_reenvio_meta.sql
-- Devolve os tres jobs ao offset zero (volta a empilhar no minuto :00 — so faz
-- sentido se algo depender do alinhamento com o minuto cheio).
-- Tambem por `alter_job`: o comando do `appointment-reminders` tem credencial
-- em texto puro e nao pode ser reescrito a partir do repositorio.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.alter_job(jobid, schedule := '* * * * *')
  from cron.job where jobname = 'meta-send-retry-worker';

select cron.alter_job(jobid, schedule := '*/10 * * * *')
  from cron.job where jobname = 'appointment-reminders';

select cron.alter_job(jobid, schedule := '*/5 * * * *')
  from cron.job where jobname = 'auto-close-worker';
