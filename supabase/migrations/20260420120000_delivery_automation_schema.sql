-- =============================================================================
-- Delivery Automation — Schema
-- -----------------------------------------------------------------------------
-- Introduces the state machine (delivery_automation_sessions) and job queue
-- (delivery_automation_jobs) required for the daily 10h BRT cron that drives
-- interactive WhatsApp scheduling for deliveries in 'aguardando_agendamento'.
--
-- Upstream/live tables referenced (verified via MCP list_tables on 2026-04-20):
--   - deliveries (user_id, patient_id, service_id, professional_id, stage,
--     contact_date, appointment_id, ...)
--   - delivery_config (user_id PK, ai_enabled BOOLEAN DEFAULT FALSE, ...)
--   - patients (id, user_id, contact_id, nome, telefone, ...)
--   - products_services (id, duration_minutes, ...)
--   - professionals (id, work_days INT[], work_hours JSONB, ...)
--   - appointments (id, user_id, professional_id, contact_id, service_id,
--     start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, status, type, ...)
--   - conversations (id, contact_id, user_id, instance_id, queue_id, status, ...)
--   - queues (id, user_id, name) — uses 'Atendimento Humano' / 'Atendimento IA'
--   - instances (id, user_id, apikey, status, ...)
-- =============================================================================

-- State machine per delivery flow ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_automation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
    professional_id UUID NOT NULL,
    service_id UUID NOT NULL,

    state TEXT NOT NULL DEFAULT 'pending_send'
        CHECK (state IN (
            'pending_send',
            'awaiting_day',
            'awaiting_period',
            'awaiting_time',
            'awaiting_confirm',
            'completed',
            'transferred',
            'abandoned',
            'failed'
        )),

    target_date DATE,                        -- candidate Brasília date
    selected_period TEXT CHECK (selected_period IN ('morning','afternoon')),
    selected_time TEXT,                       -- 'HH:MM' Brasília
    available_slots JSONB,                    -- cached slot list for target_date
    rollover_weeks INT NOT NULL DEFAULT 0,    -- zero-slots retry counter
    invalid_response_count INT NOT NULL DEFAULT 0,

    last_prompt_message_id UUID,
    last_state_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Only one ACTIVE or completed session per delivery (terminal states keep
    -- history; re-running the dispatcher on the same delivery is guarded via
    -- NOT EXISTS check on non-terminal states).
    CONSTRAINT uq_active_session_per_delivery UNIQUE (delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_das_conversation_active
    ON public.delivery_automation_sessions (conversation_id)
    WHERE state NOT IN ('completed','transferred','abandoned','failed');

CREATE INDEX IF NOT EXISTS idx_das_state
    ON public.delivery_automation_sessions (state);

CREATE INDEX IF NOT EXISTS idx_das_user
    ON public.delivery_automation_sessions (user_id);

-- Job queue (staggered) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.delivery_automation_sessions(id) ON DELETE CASCADE,

    job_type TEXT NOT NULL CHECK (job_type IN ('start','advance','reminder')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','done','error','cancelled')),
    scheduled_at TIMESTAMPTZ NOT NULL,
    picked_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daj_ready
    ON public.delivery_automation_jobs (scheduled_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_daj_session
    ON public.delivery_automation_jobs (session_id);

-- Kill switch -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_automation_flags (
    key TEXT PRIMARY KEY,
    value BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IMPORTANT: start disabled until we validate in production.
INSERT INTO public.delivery_automation_flags (key, value)
VALUES ('enabled', FALSE)
ON CONFLICT (key) DO NOTHING;

-- updated_at trigger ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delivery_automation_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_das_updated_at ON public.delivery_automation_sessions;
CREATE TRIGGER trg_das_updated_at
    BEFORE UPDATE ON public.delivery_automation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.delivery_automation_touch_updated_at();

-- RLS -------------------------------------------------------------------------
ALTER TABLE public.delivery_automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_automation_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS das_owner ON public.delivery_automation_sessions;
CREATE POLICY das_owner ON public.delivery_automation_sessions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS daj_owner ON public.delivery_automation_jobs;
CREATE POLICY daj_owner ON public.delivery_automation_jobs
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Flags: no user-facing access; only service_role (bypasses RLS) reads/writes.
DROP POLICY IF EXISTS daf_no_access ON public.delivery_automation_flags;
CREATE POLICY daf_no_access ON public.delivery_automation_flags
    FOR SELECT
    USING (FALSE);

-- Grants ----------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_automation_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_automation_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_automation_flags TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: pick_delivery_automation_job
-- Atomically claims the oldest ready job using FOR UPDATE SKIP LOCKED,
-- marks it as 'running', and returns its full row. Returns NULL if none.
-- This is the only way PostgREST clients can get SKIP LOCKED semantics.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_delivery_automation_job()
RETURNS public.delivery_automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claimed public.delivery_automation_jobs;
BEGIN
    WITH candidate AS (
        SELECT id
        FROM public.delivery_automation_jobs
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE public.delivery_automation_jobs j
       SET status = 'running',
           picked_at = now(),
           attempts = attempts + 1
      FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.* INTO claimed;

    RETURN claimed; -- NULL when no candidate
END;
$$;

REVOKE ALL ON FUNCTION public.pick_delivery_automation_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_delivery_automation_job() TO service_role;
