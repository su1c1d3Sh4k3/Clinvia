-- =============================================================================
-- Campanhas v2
-- -----------------------------------------------------------------------------
-- 1. campaign_type: 'promotion' (serviços + desconto) | 'notification'
-- 2. template_mode: 'create' (fluxo atual Meta) | 'existing' (template Meta
--    aprovado já existente) | 'none' (instância UAZAPI, sem template)
-- 3. Remove unicidade (campaign_id, contact_id): fontes como Agendamentos
--    geram 1 entrada POR REGISTRO (contato pode receber várias mensagens)
-- 4. campaign_contacts.raw_data passa a guardar o snapshot de variáveis da
--    entrada ({"nome": "...", "data_agendamento": "...", ...})
-- =============================================================================

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'promotion';

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS template_mode TEXT NOT NULL DEFAULT 'create';

DO $$ BEGIN
    ALTER TABLE public.campaigns
        ADD CONSTRAINT campaigns_campaign_type_check
        CHECK (campaign_type IN ('promotion','notification'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.campaigns
        ADD CONSTRAINT campaigns_template_mode_check
        CHECK (template_mode IN ('create','existing','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Múltiplas entradas por contato (ex.: 1 por agendamento)
DROP INDEX IF EXISTS public.uq_campaign_contact;

-- Índice não-único para os lookups por contato que o unique cobria
CREATE INDEX IF NOT EXISTS idx_cc_campaign_contact
    ON public.campaign_contacts (campaign_id, contact_id)
    WHERE contact_id IS NOT NULL;
