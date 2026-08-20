-- Fase 1 do plano de recorrência com templates (docs/reports/2026-08-20_plano_recorrencia_templates.md)
-- Desconto (%) por mensagem de recorrência (R5): um campo por abordagem 1/2/3.
-- Alimentará campaigns.discount_pct das campanhas diárias de recorrência (Fase 4).

ALTER TABLE public.services_client
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_1 numeric NULL,
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_2 numeric NULL,
    ADD COLUMN IF NOT EXISTS recurrence_discount_pct_3 numeric NULL;

COMMENT ON COLUMN public.services_client.recurrence_discount_pct_1 IS 'Desconto % da 1ª abordagem de recorrência (vira campaigns.discount_pct)';
COMMENT ON COLUMN public.services_client.recurrence_discount_pct_2 IS 'Desconto % da 2ª abordagem de recorrência (vira campaigns.discount_pct)';
COMMENT ON COLUMN public.services_client.recurrence_discount_pct_3 IS 'Desconto % da 3ª abordagem de recorrência (vira campaigns.discount_pct)';
