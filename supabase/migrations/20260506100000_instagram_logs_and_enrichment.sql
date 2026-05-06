-- =====================================================
-- Instagram: log de payloads + enriquecimento via Conversations API
-- =====================================================
-- Limpa as tabelas BETA do experimento Facebook Login (a rota se mostrou
-- equivalente à Instagram Business Login que já está em produção, então
-- não precisamos da paralela).
--
-- Cria infra para:
--   1. Logar payload bruto recebido de cada webhook do Instagram
--      (debug / auditoria de qual canal a mensagem veio).
--   2. Cron de 30 em 30 minutos chamando instagram-enrich-profiles para
--      enriquecer contatos "Instagram User" com username via Conversations API.
-- =====================================================

-- ─── 1. Drop BETA ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.instagram_fb_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.instagram_fb_instances CASCADE;
DROP FUNCTION IF EXISTS public.tg_ig_fb_instances_updated_at() CASCADE;

-- ─── 2. Tabela de logs do webhook de produção ─────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_webhook_logs (
    id BIGSERIAL PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    instance_id UUID REFERENCES public.instagram_instances(id) ON DELETE SET NULL,
    user_id UUID,
    sender_id TEXT,
    recipient_id TEXT,
    event_type TEXT,           -- 'message' | 'echo' | 'postback' | 'reaction' | 'referral' | 'seen' | 'unknown'
    has_text BOOLEAN,
    has_attachment BOOLEAN,
    referral_source TEXT,      -- ex: 'ADS' | 'STORY_REPLY' | 'CUSTOMER_CHAT_PLUGIN' | 'COMMENTS_TO_DM'
    payload JSONB NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_logs_received_at
    ON public.instagram_webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_webhook_logs_sender
    ON public.instagram_webhook_logs(sender_id);
CREATE INDEX IF NOT EXISTS idx_ig_webhook_logs_user
    ON public.instagram_webhook_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_webhook_logs_event_type
    ON public.instagram_webhook_logs(event_type);

ALTER TABLE public.instagram_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Owners podem ler seus próprios logs; service_role tem acesso total
CREATE POLICY ig_webhook_logs_owner_select
    ON public.instagram_webhook_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- ─── 3. Cron de enrichment via Conversations API ───────────────────────
-- Roda a cada 30 minutos, chama a edge function que itera as instances
-- conectadas e atualiza contatos com username quando possível.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove cron antigo se existir (idempotência)
DO $$
BEGIN
    PERFORM cron.unschedule('instagram-enrich-profiles');
EXCEPTION WHEN OTHERS THEN
    -- cron pode não existir ainda
    NULL;
END $$;

SELECT cron.schedule(
    'instagram-enrich-profiles',
    '*/30 * * * *',  -- a cada 30 min
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/instagram-enrich-profiles',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);
