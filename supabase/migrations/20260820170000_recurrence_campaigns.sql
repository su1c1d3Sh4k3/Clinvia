-- Fase 4 recorrência: campanhas diárias geradas automaticamente
-- (plano docs/reports/2026-08-20_plano_recorrencia_templates.md, R7-R13)

-- ── campaigns: vínculo de recorrência + bloqueio R9 ─────────────────────────
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS recurrence_date date NULL,
    ADD COLUMN IF NOT EXISTS recurrence_service_client_id uuid NULL
        REFERENCES public.services_client(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurrence_msg_number smallint NULL
        CHECK (recurrence_msg_number BETWEEN 1 AND 3),
    ADD COLUMN IF NOT EXISTS blocked_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_recurrence_date
    ON public.campaigns (user_id, recurrence_date)
    WHERE recurrence_date IS NOT NULL;

-- Novo source_type 'recurrence' + status 'blocked' (R9: criada mas não disparada)
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_source_type_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_source_type_check
    CHECK (source_type IN ('csv','xml','crm','tag','appointments','sales','recurrence'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('scheduled','awaiting_template','dispatching','dispatched','error','cancelled','expired','blocked'));

-- ── recurrence_tracking: vínculo abordagem → campanha (writeback R12) ───────
ALTER TABLE public.recurrence_tracking
    ADD COLUMN IF NOT EXISTS approach_1_campaign_id uuid NULL
        REFERENCES public.campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approach_2_campaign_id uuid NULL
        REFERENCES public.campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approach_3_campaign_id uuid NULL
        REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- ── invoke + pg_cron diário 05:00 BRT (08:00 UTC) ───────────────────────────
CREATE OR REPLACE FUNCTION public.invoke_recurrence_campaign_generator()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/recurrence-campaign-generator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'recurrence-campaign-generator invoke error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_recurrence_campaign_generator() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('recurrence-campaign-generator'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('recurrence-campaign-generator','0 8 * * *',
    $CRON$SELECT public.invoke_recurrence_campaign_generator()$CRON$);
