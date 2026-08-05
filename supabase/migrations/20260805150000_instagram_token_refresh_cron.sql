-- ============================================================================
-- Instagram: cron de refresh de token + correção de status expirado
-- ============================================================================
-- CONTEXTO
-- ========
-- Tokens long-lived do Instagram expiram em ~60 dias e só podem ser
-- renovados ENQUANTO ainda válidos (graph.instagram.com/refresh_access_token).
-- A edge function `instagram-refresh-token` existe desde o início, mas nunca
-- houve cron chamando-a → 3 de 4 contas ficaram com token expirado e o envio
-- parou silenciosamente (status continuava 'connected').
--
-- CORREÇÕES
-- =========
-- A) Cron diário 'instagram-refresh-tokens': chama instagram-refresh-token
--    para cada instância conectada cujo token expira nos próximos 15 dias.
-- B) Marcar como 'expired' as instâncias cujo token_expires_at já passou
--    (a UI/usuário precisa reconectar via OAuth — refresh é impossível).
-- ============================================================================

-- A) Cron diário às 04:15 UTC (01:15 BRT)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname = 'instagram-refresh-tokens';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'instagram-refresh-tokens',
    '15 4 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/instagram-refresh-token',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('instance_id', i.id)
    )
    FROM instagram_instances i
    WHERE i.status = 'connected'
      AND i.access_token IS NOT NULL
      AND i.token_expires_at IS NOT NULL
      AND i.token_expires_at > NOW()
      AND i.token_expires_at < NOW() + INTERVAL '15 days';
    $$
);

-- B) Corrigir status de instâncias com token já expirado
UPDATE instagram_instances
SET status = 'expired', updated_at = NOW()
WHERE token_expires_at IS NOT NULL
  AND token_expires_at < NOW()
  AND status <> 'expired';
