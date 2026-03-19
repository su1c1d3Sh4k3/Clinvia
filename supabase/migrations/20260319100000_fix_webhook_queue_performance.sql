-- =====================================================================
-- Fix webhook_queue performance: índices + limpeza de registros antigos
-- =====================================================================

-- 1. Índice composto para a query mais pesada do processor:
--    SELECT WHERE status='pending' AND attempts < 3 ORDER BY created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_queue_status_attempts_created
    ON webhook_queue(status, attempts, created_at ASC);

-- 2. Índice para limpeza periódica (DELETE WHERE status IN ('done','failed'))
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_queue_status_created
    ON webhook_queue(status, created_at);

-- 3. Limpar registros done/failed com mais de 2 dias (reduz tamanho da tabela imediatamente)
DELETE FROM webhook_queue
WHERE status IN ('done', 'failed')
  AND created_at < NOW() - INTERVAL '2 days';

-- 4. Resetar jobs travados em 'processing' há mais de 10 minutos
--    (ficaram presos durante a crise de conexões)
UPDATE webhook_queue
SET
    status = 'pending',
    attempts = LEAST(COALESCE(attempts, 0), 2)
WHERE
    status = 'processing'
    AND started_at < NOW() - INTERVAL '10 minutes';

-- 5. Marcar como 'failed' jobs que ultrapassaram MAX_ATTEMPTS e ainda estão pending
UPDATE webhook_queue
SET status = 'failed'
WHERE status = 'pending'
  AND attempts >= 3;
