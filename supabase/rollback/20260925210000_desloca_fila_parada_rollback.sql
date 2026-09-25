-- Rollback de 20260925210000_desloca_fila_parada.sql
-- Devolve o detector de fila parada ao minuto :00 (volta a encostar no pior
-- minuto do dia — so faz sentido se algo depender do alinhamento).

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('webhook-queue-stuck-scan')
 where exists (select 1 from cron.job where jobname = 'webhook-queue-stuck-scan');

select cron.schedule('webhook-queue-stuck-scan', '*/5 * * * *',
    $$select public.webhook_queue_stuck_scan()$$);
