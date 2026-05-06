-- Adiciona payload bruto completo (string) e headers HTTP da request original
-- para auditoria/análise forense de cada mensagem recebida do Instagram.
ALTER TABLE public.instagram_webhook_logs
    ADD COLUMN IF NOT EXISTS raw_body TEXT,
    ADD COLUMN IF NOT EXISTS http_headers JSONB,
    ADD COLUMN IF NOT EXISTS full_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_ig_webhook_logs_full_payload
    ON public.instagram_webhook_logs
    USING gin (full_payload);

COMMENT ON COLUMN public.instagram_webhook_logs.raw_body IS 'Body bruto da request HTTP (texto) exatamente como o Meta enviou.';
COMMENT ON COLUMN public.instagram_webhook_logs.http_headers IS 'Headers HTTP relevantes (signature, content-type, user-agent, etc).';
COMMENT ON COLUMN public.instagram_webhook_logs.full_payload IS 'Payload JSON completo do webhook (envelope object + entry + messaging[]).';
COMMENT ON COLUMN public.instagram_webhook_logs.payload IS 'Apenas o evento individual (entry.messaging[i]) — útil para indexar.';
