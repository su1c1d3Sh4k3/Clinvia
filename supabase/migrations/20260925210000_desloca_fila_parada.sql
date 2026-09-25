-- O detector de fila parada nasceu em `*/5 * * * *` e caiu exatamente no minuto
-- :00, que ja e o pior minuto do dia: `item_rajada_conexoes` mediu 13 jobs
-- partindo juntos as 03:00 contra 14 conexoes livres de 60. O commit c33529f
-- existiu justamente para escalonar isso — encostar mais um job no :00 desfaz
-- aquele trabalho em silencio.
--
-- Deslocar para 3-59/5 mantem a frequencia (a cada 5 minutos) e o corte de 10
-- minutos de atraso, e tira o job do aglomerado. Nao ha perda de cobertura:
-- payload represado nao tem hora marcada.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('webhook-queue-stuck-scan')
 where exists (select 1 from cron.job where jobname = 'webhook-queue-stuck-scan');

select cron.schedule('webhook-queue-stuck-scan', '3-59/5 * * * *',
    $$select public.webhook_queue_stuck_scan()$$);
