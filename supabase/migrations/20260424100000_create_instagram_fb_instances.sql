-- =====================================================
-- Instagram FB Instances (Test/Beta)
-- =====================================================
-- Tabela espelhada para o fluxo BETA "Facebook Login for Business".
-- A tabela `instagram_instances` (existente) continua intacta para o
-- fluxo de produção atual. Esta nova tabela armazena conexões feitas
-- via Facebook Login → Page Access Token, que é o caminho oficial
-- recomendado pelo Meta em 2026 para acessar o User Profile API.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.instagram_fb_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Facebook Page (token holder no fluxo Messenger Platform)
    facebook_page_id TEXT NOT NULL,
    facebook_page_name TEXT,
    page_access_token TEXT NOT NULL,
    -- Page Access Tokens via /me/accounts são "permanentes" enquanto
    -- o user token original que os gerou estiver válido. Salvamos o
    -- expiry do user token só para auditoria.
    user_token_expires_at TIMESTAMPTZ,

    -- Instagram Business Account vinculada à Page
    instagram_business_account_id TEXT NOT NULL,
    instagram_username TEXT,

    -- Status / metadata
    status TEXT NOT NULL DEFAULT 'connected',  -- connected | disconnected | error
    last_error TEXT,
    webhook_subscribed BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Um mesmo user só conecta uma vez por IGBA
    CONSTRAINT uq_user_iba UNIQUE (user_id, instagram_business_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_fb_instances_user_id
    ON public.instagram_fb_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_fb_instances_page_id
    ON public.instagram_fb_instances(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_ig_fb_instances_iba_id
    ON public.instagram_fb_instances(instagram_business_account_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_ig_fb_instances_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ig_fb_instances_updated_at ON public.instagram_fb_instances;
CREATE TRIGGER trg_ig_fb_instances_updated_at
    BEFORE UPDATE ON public.instagram_fb_instances
    FOR EACH ROW EXECUTE FUNCTION public.tg_ig_fb_instances_updated_at();

-- RLS
ALTER TABLE public.instagram_fb_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY ig_fb_instances_owner_select
    ON public.instagram_fb_instances
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY ig_fb_instances_owner_modify
    ON public.instagram_fb_instances
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- service_role bypassa RLS automaticamente (usado pelas edge functions)

-- =====================================================
-- Tabela de logs de payload bruto (debug)
-- =====================================================
-- Toda mensagem recebida pelo webhook BETA é salva crua aqui para
-- auditoria. Pode ser truncada (TRUNCATE) periodicamente.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.instagram_fb_webhook_logs (
    id BIGSERIAL PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    page_id TEXT,
    sender_id TEXT,
    payload JSONB NOT NULL,
    user_profile_response JSONB,         -- resposta crua da User Profile API
    user_profile_status_code INT,        -- HTTP status da chamada de profile
    instance_id UUID REFERENCES public.instagram_fb_instances(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ig_fb_logs_received_at
    ON public.instagram_fb_webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_fb_logs_sender_id
    ON public.instagram_fb_webhook_logs(sender_id);
CREATE INDEX IF NOT EXISTS idx_ig_fb_logs_page_id
    ON public.instagram_fb_webhook_logs(page_id);

ALTER TABLE public.instagram_fb_webhook_logs ENABLE ROW LEVEL SECURITY;
-- Apenas service_role consulta os logs (via funções/admin); RLS bloqueia user direto.
CREATE POLICY ig_fb_logs_service_only
    ON public.instagram_fb_webhook_logs
    FOR ALL
    USING (false);
