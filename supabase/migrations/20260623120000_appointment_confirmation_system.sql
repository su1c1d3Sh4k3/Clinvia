-- =============================================================================
-- Appointment Confirmation System
-- Automatic 24h-before confirmation, 2h-before reminder, 24h-after feedback
-- =============================================================================

-- 1. Session tracking table
CREATE TABLE IF NOT EXISTS public.appointment_confirmation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,

    appointment_ids UUID[] NOT NULL,
    appointment_date DATE NOT NULL,

    flow_type TEXT NOT NULL CHECK (flow_type IN ('confirm_24h', 'reminder_2h', 'feedback_24h')),

    state TEXT NOT NULL DEFAULT 'pending_send' CHECK (state IN (
        'pending_send',
        'awaiting_confirmation',
        'awaiting_cancel_reason',
        'awaiting_feedback_rating',
        'awaiting_feedback_detail',
        'completed',
        'transferred',
        'failed'
    )),

    selected_rating TEXT,
    cancel_reason TEXT,
    feedback_text TEXT,
    invalid_response_count INT NOT NULL DEFAULT 0,

    last_prompt_message_id UUID,
    last_state_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one session per contact per flow per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_acs_unique_flow
    ON public.appointment_confirmation_sessions (contact_id, flow_type, appointment_date);

CREATE INDEX IF NOT EXISTS idx_acs_contact_active
    ON public.appointment_confirmation_sessions (contact_id)
    WHERE state NOT IN ('completed', 'transferred', 'failed');

CREATE INDEX IF NOT EXISTS idx_acs_user
    ON public.appointment_confirmation_sessions (user_id);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION public.acs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_acs_updated_at ON public.appointment_confirmation_sessions;
CREATE TRIGGER trg_acs_updated_at
    BEFORE UPDATE ON public.appointment_confirmation_sessions
    FOR EACH ROW EXECUTE FUNCTION public.acs_touch_updated_at();

-- RLS
ALTER TABLE public.appointment_confirmation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acs_service_role ON public.appointment_confirmation_sessions;
CREATE POLICY acs_service_role ON public.appointment_confirmation_sessions
    FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_confirmation_sessions TO service_role;

-- =============================================================================
-- 2. DB Trigger: route inbound messages to appointment-confirmation-respond
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trigger_appointment_confirmation_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
    v_contact_id UUID;
    v_user_id UUID;
    v_session_id UUID;
    v_session_state TEXT;
    v_service_key TEXT;
    v_supabase_url TEXT;
BEGIN
    IF NEW.direction::text <> 'inbound' THEN RETURN NEW; END IF;
    IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

    SELECT c.contact_id, c.user_id INTO v_contact_id, v_user_id
    FROM public.conversations c WHERE c.id = NEW.conversation_id LIMIT 1;
    IF v_contact_id IS NULL THEN RETURN NEW; END IF;

    SELECT acs.id, acs.state INTO v_session_id, v_session_state
    FROM public.appointment_confirmation_sessions acs
    WHERE acs.contact_id = v_contact_id
      AND acs.state NOT IN ('completed', 'transferred', 'failed')
    ORDER BY acs.created_at DESC
    LIMIT 1;
    IF v_session_id IS NULL THEN RETURN NEW; END IF;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    IF v_service_key IS NULL OR v_supabase_url IS NULL THEN RETURN NEW; END IF;

    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/appointment-confirmation-respond',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'conversationId', NEW.conversation_id,
            'contactId', v_contact_id,
            'userId', v_user_id,
            'rawMessage', COALESCE(NEW.body, ''),
            'buttonText', COALESCE(NEW.body, ''),
            'buttonId', NULL
        ),
        timeout_milliseconds := 15000
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'appointment-confirmation inbound trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_confirmation_on_inbound ON public.messages;
CREATE TRIGGER trg_appointment_confirmation_on_inbound
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_appointment_confirmation_on_inbound();

GRANT EXECUTE ON FUNCTION public.trigger_appointment_confirmation_on_inbound() TO service_role;

-- =============================================================================
-- 3. pg_cron: invoke appointment-confirmation-cron every 10 minutes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.invoke_appointment_confirmation_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    PERFORM net.http_post(
        url := v_url || '/functions/v1/appointment-confirmation-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[appointment-confirmation cron] error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_appointment_confirmation_cron() TO service_role;

SELECT cron.schedule(
    'appointment-confirmation-cron',
    '*/10 * * * *',
    $$SELECT public.invoke_appointment_confirmation_cron()$$
);
