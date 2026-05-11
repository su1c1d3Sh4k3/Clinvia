-- ============================================================================
-- Cleanup: net._http_response e cron.job_run_details + crons periódicos
-- ============================================================================
-- DESCOBERTA: pg_stat_statements mostrou que 50.5% de TODO o CPU do banco
-- estava sendo consumido por UMA query — o cleanup automático do pg_net
-- na tabela `net._http_response`. Detalhes da query:
--
--   WITH rows AS (SELECT ctid FROM net._http_response WHERE created < $1 ...)
--   DELETE FROM net._http_response r USING rows WHERE r.ctid = rows.ctid;
--
--   - 6 calls acumulados, mean 214_279 ms, max 432_091 ms (7 MIN)
--   - Total: 1_285_673 ms (21 MIN) de CPU
--
-- Causa: a tabela tinha 251 MB acumulados de responses de http_post de TODOS
-- os crons que fazem fetch (delivery-automation-worker, check-reminders,
-- appointment-reminders, etc — pelo menos 4 crons rodando a cada minuto).
-- O cleanup interno do pg_net não consegue acompanhar essa taxa de inserção.
--
-- Quando esse DELETE rodava, ele bloqueava o banco para a maioria das outras
-- queries — daí o sintoma "TUDO está lento, CRM, mensagens internas, filas,
-- tudo demora 1 minuto pra carregar".
--
-- Também encontrado: cron.job_run_details tinha 129 MB (histórico de execução
-- de crons indefinido).
--
-- CORREÇÃO (já aplicada via execute_sql, esta migration documenta):
--   1. TRUNCATE net._http_response       (251 MB → 32 KB)
--   2. TRUNCATE cron.job_run_details     (129 MB → 32 KB)
--   3. Cron a cada 1h limpa net._http_response > 1h
--   4. Cron a cada 6h limpa cron.job_run_details > 24h
--
-- IMPACTO: 380 MB liberados, 50% do CPU do banco devolvido às queries reais.
-- ============================================================================

-- TRUNCATE manual já foi executado, mas DROP/CREATE dos crons é idempotente
-- e pode rodar sempre. Esta migration garante que mesmo em recriação do banco
-- os crons existirão.

-- Remove versões antigas (idempotente — não falha se não existir)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('cleanup-pg-net-responses', 'cleanup-cron-history');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Job: limpar net._http_response (responses de http_post) a cada hora
-- Mantém apenas a última hora — responses não são consultadas após esse tempo
SELECT cron.schedule(
  'cleanup-pg-net-responses',
  '0 * * * *',
  $$DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '1 hour'$$
);

-- Job: limpar cron.job_run_details (histórico de execução) a cada 6 horas
-- Mantém últimas 24 horas — suficiente pra debug de jobs com problema
SELECT cron.schedule(
  'cleanup-cron-history',
  '0 */6 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '24 hours'$$
);

COMMENT ON EXTENSION pg_net IS
'Resposta HTTP é guardada em net._http_response. Crons que fazem http_post '
'enchem essa tabela rapidamente — cleanup automático interno não acompanha. '
'Cron cleanup-pg-net-responses cuida disso a cada hora.';
