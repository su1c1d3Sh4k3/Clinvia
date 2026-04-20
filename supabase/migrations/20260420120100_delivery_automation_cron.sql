-- =============================================================================
-- Delivery Automation — pg_cron
-- -----------------------------------------------------------------------------
-- Two scheduled jobs:
--   1. Dispatcher: once a day at 10:00 Brasília (= 13:00 UTC) scans eligible
--      deliveries and enqueues staggered jobs.
--   2. Worker: every minute, picks up ready jobs and sends messages.
--
-- The cron functions respect the kill-switch at delivery_automation_flags:
--   UPDATE delivery_automation_flags SET value=TRUE WHERE key='enabled';
--   UPDATE delivery_automation_flags SET value=FALSE WHERE key='enabled';
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Dispatcher invoker ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_delivery_automation_dispatcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    enabled BOOLEAN;
    response TEXT;
BEGIN
    SELECT value INTO enabled
    FROM public.delivery_automation_flags
    WHERE key = 'enabled';

    IF NOT COALESCE(enabled, FALSE) THEN
        RAISE NOTICE 'delivery-automation dispatcher: disabled — skipping';
        RETURN;
    END IF;

    SELECT content::text INTO response
    FROM http_post(
        current_setting('app.settings.supabase_url') || '/functions/v1/delivery-automation-dispatcher',
        '{}',
        'application/json',
        ARRAY[
            ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
            ('Content-Type', 'application/json')
        ]
    );

    RAISE NOTICE 'delivery-automation dispatcher response: %', response;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'delivery-automation dispatcher error: %', SQLERRM;
END;
$$;

-- Worker invoker --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_delivery_automation_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    enabled BOOLEAN;
    response TEXT;
BEGIN
    SELECT value INTO enabled
    FROM public.delivery_automation_flags
    WHERE key = 'enabled';

    IF NOT COALESCE(enabled, FALSE) THEN
        -- worker silent skip — avoid log spam
        RETURN;
    END IF;

    SELECT content::text INTO response
    FROM http_post(
        current_setting('app.settings.supabase_url') || '/functions/v1/delivery-automation-worker',
        '{}',
        'application/json',
        ARRAY[
            ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
            ('Content-Type', 'application/json')
        ]
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'delivery-automation worker error: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoke_delivery_automation_dispatcher() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_delivery_automation_worker()    TO service_role;

-- Schedule dispatcher: 10:00 Brasília = 13:00 UTC (no DST in Brazil) ----------
-- Unschedule prior runs defensively before re-creating (idempotent).
DO $$
BEGIN
    PERFORM cron.unschedule('delivery-automation-dispatcher');
EXCEPTION WHEN OTHERS THEN
    -- ignore "could not find job"
    NULL;
END $$;

SELECT cron.schedule(
    'delivery-automation-dispatcher',
    '0 13 * * *',
    $$SELECT public.invoke_delivery_automation_dispatcher()$$
);

DO $$
BEGIN
    PERFORM cron.unschedule('delivery-automation-worker');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'delivery-automation-worker',
    '* * * * *',
    $$SELECT public.invoke_delivery_automation_worker()$$
);
