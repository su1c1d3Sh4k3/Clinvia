-- API de consumo de tokens do n8n (user request 2026-08-21):
-- n8n chama api-token-usage a cada requisição da IA com {workflow id, execution,
-- model, tokens}; calculamos custo USD (tabela llm_model_prices) e BRL (cotação
-- real USD-BRL) e somamos nos acumuladores existentes do tenant.
-- IA do n8n = token_usage_log.source 'n8n' | IA do sistema = 'system' (default).

SET lock_timeout = '5s';

-- 1) Colunas novas no log detalhado
ALTER TABLE public.token_usage_log
    ADD COLUMN IF NOT EXISTS cost_brl NUMERIC(12, 6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS workflow_id TEXT,
    ADD COLUMN IF NOT EXISTS execution_id BIGINT,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_token_usage_log_owner_source
    ON public.token_usage_log (owner_id, source, created_at);

-- 2) Tabela de preços por modelo (USD por 1M tokens) — editável sem deploy
CREATE TABLE IF NOT EXISTS public.llm_model_prices (
    model TEXT PRIMARY KEY,
    input_usd_per_1m NUMERIC(10, 4) NOT NULL,
    output_usd_per_1m NUMERIC(10, 4) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.llm_model_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llm_model_prices_read ON public.llm_model_prices;
CREATE POLICY llm_model_prices_read ON public.llm_model_prices
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS llm_model_prices_service ON public.llm_model_prices;
CREATE POLICY llm_model_prices_service ON public.llm_model_prices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Preços vigentes (pesquisados 2026-08-21 — pós price cuts de julho/2026)
INSERT INTO public.llm_model_prices (model, input_usd_per_1m, output_usd_per_1m) VALUES
    ('gpt-5.4',      1.25, 7.50),
    ('gpt-5.4-mini', 0.75, 4.50),
    ('gpt-4.1-mini', 0.40, 1.60),
    ('gpt-4.1',      2.00, 8.00),
    ('gpt-4o',       2.50, 10.00),
    ('gpt-4o-mini',  0.15, 0.60)
ON CONFLICT (model) DO UPDATE SET
    input_usd_per_1m = EXCLUDED.input_usd_per_1m,
    output_usd_per_1m = EXCLUDED.output_usd_per_1m,
    updated_at = NOW();

-- 3) RPC para somar nos acumuladores do tenant SEM inserir log (o log do n8n é
--    inserido pela edge fn com cost_brl/workflow_id; track_token_usage insere
--    o próprio log e não conhece BRL)
CREATE OR REPLACE FUNCTION public.increment_profile_token_usage(
    p_owner_id UUID,
    p_tokens BIGINT,
    p_cost_usd NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles SET
        tokens_total = COALESCE(tokens_total, 0) + p_tokens,
        tokens_monthly = COALESCE(tokens_monthly, 0) + p_tokens,
        approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd,
        approximate_cost_monthly = COALESCE(approximate_cost_monthly, 0) + p_cost_usd
    WHERE id = p_owner_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_profile_token_usage FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_profile_token_usage TO service_role;
