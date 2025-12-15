-- Add loss_reason fields to crm_deals
-- loss_reason: pre-defined reason key (price, competitor, timing, etc.)
-- loss_reason_other: custom text when reason is 'other'

ALTER TABLE public.crm_deals
ADD COLUMN IF NOT EXISTS loss_reason TEXT;

ALTER TABLE public.crm_deals
ADD COLUMN IF NOT EXISTS loss_reason_other TEXT;

-- Comments
COMMENT ON COLUMN public.crm_deals.loss_reason IS 'Motivo da perda: price, competitor, timing, no_budget, no_need, no_response, product_fit, service_quality, other';
COMMENT ON COLUMN public.crm_deals.loss_reason_other IS 'Descrição customizada quando loss_reason = other';

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_crm_deals_loss_reason ON public.crm_deals(loss_reason);
