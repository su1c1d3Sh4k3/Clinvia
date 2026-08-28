-- =====================================================
-- Cron: account-emails-cron (diario, 05:00 BRT / 08:00 UTC)
-- =====================================================
-- Dispara a edge function account-emails-cron, responsavel por:
--   * relatorio mensal de consumo (todo dia 1o, mes anterior)
--   * aviso de exclusao de dados (D-7 do fim da retencao de 30 dias)
-- A propria funcao decide o que enviar a partir da data — rodar em outro dia
-- simplesmente nao envia nada.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_account_emails_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    IF v_url IS NULL OR v_key IS NULL THEN
        RAISE NOTICE '[account-emails-cron] secrets ausentes em vault — pulando execucao';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/account-emails-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[account-emails-cron] error: %', SQLERRM;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'account-emails-cron' LOOP
        PERFORM cron.unschedule(r.jobid);
    END LOOP;
END $$;

SELECT cron.schedule(
    'account-emails-cron',
    '0 8 * * *',
    $CRON$SELECT public.invoke_account_emails_cron()$CRON$
);
