-- =============================================================================
-- Delivery Automation — pg_cron (dispatcher 10h BRT + worker per minute)
-- -----------------------------------------------------------------------------
-- Uses vault.decrypted_secrets + net.http_post (same pattern as other cron
-- jobs in this project, e.g. generate-opportunities-daily).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_delivery_automation_dispatcher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    enabled BOOLEAN;
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT value INTO enabled FROM public.delivery_automation_flags WHERE key='enabled';
    IF NOT COALESCE(enabled, FALSE) THEN
        RAISE NOTICE 'delivery-automation dispatcher: disabled — skipping';
        RETURN;
    END IF;
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    PERFORM net.http_post(
        url := v_url || '/functions/v1/delivery-automation-dispatcher',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'delivery-automation dispatcher error: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.invoke_delivery_automation_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    enabled BOOLEAN;
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT value INTO enabled FROM public.delivery_automation_flags WHERE key='enabled';
    IF NOT COALESCE(enabled, FALSE) THEN RETURN; END IF;
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    PERFORM net.http_post(
        url := v_url || '/functions/v1/delivery-automation-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'delivery-automation worker error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_delivery_automation_dispatcher() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_delivery_automation_worker() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('delivery-automation-dispatcher'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('delivery-automation-dispatcher','0 13 * * *',
    $CRON$SELECT public.invoke_delivery_automation_dispatcher()$CRON$);

DO $$ BEGIN PERFORM cron.unschedule('delivery-automation-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('delivery-automation-worker','* * * * *',
    $CRON$SELECT public.invoke_delivery_automation_worker()$CRON$);
