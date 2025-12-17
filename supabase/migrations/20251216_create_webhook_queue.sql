-- =============================================
-- Tabela: webhook_queue
-- Descrição: Fila para processamento assíncrono de webhooks
-- Data: 2025-12-16
-- =============================================

CREATE TABLE IF NOT EXISTS webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, processing, done, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_queue(status);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_created ON webhook_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_instance ON webhook_queue(instance_name);

-- Comentários
COMMENT ON TABLE webhook_queue IS 'Fila para processamento assíncrono de webhooks UZAPI';
COMMENT ON COLUMN webhook_queue.status IS 'pending = aguardando, processing = em processamento, done = concluído, failed = falhou após max_attempts';
