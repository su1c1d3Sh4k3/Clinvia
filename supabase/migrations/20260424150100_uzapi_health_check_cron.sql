-- =====================================================
-- Cron: uzapi-health-check a cada 10 minutos
-- =====================================================
-- Dispara a edge function uzapi-health-check que pinga UZAPI para cada instancia
-- e atualiza instances.status + cria notifications em transicoes de estado.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_uzapi_health_check()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    IF v_url IS NULL OR v_key IS NULL THEN
        RAISE NOTICE '[uzapi-health-check cron] secrets ausentes em vault — pulando execucao';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/uzapi-health-check',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[uzapi-health-check cron] error: %', SQLERRM;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'uzapi-health-check' LOOP
        PERFORM cron.unschedule(r.jobid);
    END LOOP;
END $$;

SELECT cron.schedule(
    'uzapi-health-check',
    '*/10 * * * *',
    $CRON$SELECT public.invoke_uzapi_health_check()$CRON$
);
