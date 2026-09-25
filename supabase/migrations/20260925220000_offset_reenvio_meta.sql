-- O worker de reenvio da Meta nasceu em `* * * * *` e, por isso, encostou no
-- minuto :00 — que ja e o pior minuto do dia. Medido agora: 11 jobs de hora em
-- hora partindo juntos no :00, mais uma diaria (03:00, 08:00 e 11:00), contra
-- 15 conexoes livres de 60. A meta desta migration e folga de PELO MENOS 4
-- conexoes no minuto cheio.
--
-- Por que deslocar nao quebra a espera de 30s / 2min / 10min:
-- o worker so pega linha com `next_attempt_at <= now()`, isto e, a espera e
-- PISO, nunca teto. Um cron de granularidade de minuto ja entregava "30s" como
-- "entre 30s e 90s"; tirar o minuto :00 acrescenta, no maximo, 60s uma vez por
-- hora. Nenhuma mensagem sai ANTES do tempo, que e a parte que importa:
-- reenviar cedo demais e o que a Meta le como insistencia.
--
-- Tres jobs saem do :00. Nenhum muda de frequencia:
--   meta-send-retry-worker  `* * * * *`    -> `1-59 * * * *`     (59x/h, pula so o :00)
--   appointment-reminders   `*/10 * * * *` -> `6-59/10 * * * *`  (6x/h)
--   auto-close-worker       `*/5 * * * *`  -> `4-59/5 * * * *`   (12x/h)
-- Sobram 8 jobs de hora em hora no :00 (+1 diaria nas tres horas cheias que
-- tem uma) = pico 9, folga >= 4 mesmo se o pool apertar para 13 livres.
--
-- Os offsets 4 e 6 nao sao enfeite: tirar do :00 so vale se o job pousar num
-- minuto VAZIO. Na primeira tentativa usei 2 e 4 e criei um pico NOVO de 13 no
-- :17 — o histograma ja tinha 12 ali. Medido o minuto a minuto antes de
-- escolher: 4-59/5 e 6-59/10 nao se cruzam entre si e caem so em minutos de
-- base <= 11, entao o pior minuto do dia continua 12, que e o que ja era.
--
-- Usa `cron.alter_job`, e NAO unschedule+schedule, de proposito: o comando do
-- `appointment-reminders` carrega credencial em texto puro no corpo do job.
-- Reagendar pelo caminho normal obrigaria a copiar esse corpo para dentro de um
-- arquivo versionado do repositorio. `alter_job` troca so o campo `schedule` e
-- nao encosta no comando — nenhum segredo passa por aqui.
-- DIVIDA ABERTA, anotada e nao corrigida nesta rodada: esse job deveria ler a
-- chave do vault, como os invocadores novos ja fazem.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.alter_job(jobid, schedule := '1-59 * * * *')
  from cron.job where jobname = 'meta-send-retry-worker';

select cron.alter_job(jobid, schedule := '6-59/10 * * * *')
  from cron.job where jobname = 'appointment-reminders';

select cron.alter_job(jobid, schedule := '4-59/5 * * * *')
  from cron.job where jobname = 'auto-close-worker';
