-- =====================================================
-- Cron: calibrate-cache-ratio (diario, 01:10 BRT / 04:10 UTC)
-- =====================================================
-- Mede na Usage API da OpenAI quanto do input foi servido pelo cache
-- (llm_cache_calibration) e guarda o uso diario bruto (llm_provider_usage_daily).
-- A api-token-usage usa esse ratio para estimar os tokens cacheados que o n8n
-- nao informa. Sem o secret OPENAI_ADMIN_KEY a funcao responde com aviso e a
-- calibracao anterior continua valendo — nunca zera.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_calibrate_cache_ratio()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    IF v_url IS NULL OR v_key IS NULL THEN
        RAISE NOTICE '[calibrate-cache-ratio] secrets ausentes em vault — pulando execucao';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/calibrate-cache-ratio',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{"days": 7}'::jsonb,
        timeout_milliseconds := 120000
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[calibrate-cache-ratio] error: %', SQLERRM;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'calibrate-cache-ratio' LOOP
        PERFORM cron.unschedule(r.jobid);
    END LOOP;
END $$;

SELECT cron.schedule(
    'calibrate-cache-ratio',
    '10 4 * * *',
    $CRON$SELECT public.invoke_calibrate_cache_ratio()$CRON$
);
