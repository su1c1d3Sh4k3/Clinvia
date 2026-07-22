-- CRM Dashboard: daily stage snapshots + conversation resolved_at tracking
-- Snapshot runs daily at 23:59 America/Sao_Paulo (02:59 UTC)

-- ── 1) conversations.resolved_at ──
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE public.conversations
SET resolved_at = updated_at
WHERE status = 'resolved' AND resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_conversation_resolved_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
        NEW.resolved_at := now();
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_conversation_resolved_at ON public.conversations;
CREATE TRIGGER trg_set_conversation_resolved_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.set_conversation_resolved_at();

-- ── 2) Snapshot table ──
CREATE TABLE IF NOT EXISTS public.crm_stage_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    snapshot_date DATE NOT NULL,
    stage TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    open_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    resolved_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, snapshot_date, stage)
);

CREATE INDEX IF NOT EXISTS idx_crm_snapshots_user_date
    ON public.crm_stage_daily_snapshots (user_id, snapshot_date);

ALTER TABLE public.crm_stage_daily_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view crm snapshots" ON public.crm_stage_daily_snapshots;
CREATE POLICY "Team can view crm snapshots" ON public.crm_stage_daily_snapshots
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);

-- ── 3) Compute counts per stage for a user/date ──
CREATE OR REPLACE FUNCTION public.compute_crm_stage_counts(p_user_id UUID, p_date DATE)
RETURNS TABLE(stage TEXT, total INTEGER, open_count INTEGER, pending_count INTEGER, resolved_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH deals AS (
    SELECT cc.stage AS s, cc.contact_id
    FROM crm_client cc
    WHERE cc.user_id = p_user_id AND cc.is_active = TRUE
),
active_conv AS (
    SELECT DISTINCT ON (c.contact_id) c.contact_id, c.status
    FROM conversations c
    WHERE c.user_id = p_user_id AND c.status IN ('open', 'pending')
    ORDER BY c.contact_id, c.created_at DESC
),
resolved_on_date AS (
    SELECT c.contact_id, COUNT(*) AS cnt
    FROM conversations c
    WHERE c.user_id = p_user_id
      AND c.status = 'resolved'
      AND (c.resolved_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date
    GROUP BY c.contact_id
)
SELECT d.s AS stage,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ac.status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE ac.status = 'pending')::int AS pending_count,
       COALESCE(SUM(rt.cnt), 0)::int AS resolved_count
FROM deals d
LEFT JOIN active_conv ac ON ac.contact_id = d.contact_id
LEFT JOIN resolved_on_date rt ON rt.contact_id = d.contact_id
GROUP BY d.s;
$$;

-- ── 4) Live RPC for frontend (today, current owner) ──
CREATE OR REPLACE FUNCTION public.get_crm_stage_counts()
RETURNS TABLE(stage TEXT, total INTEGER, open_count INTEGER, pending_count INTEGER, resolved_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT * FROM public.compute_crm_stage_counts(
    public.get_owner_id(),
    (now() AT TIME ZONE 'America/Sao_Paulo')::date
);
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_stage_counts() TO authenticated;

-- ── 5) Daily capture (all users) ──
CREATE OR REPLACE FUNCTION public.capture_crm_daily_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID;
    v_date DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    FOR v_user IN SELECT DISTINCT user_id FROM crm_client LOOP
        INSERT INTO crm_stage_daily_snapshots
            (user_id, snapshot_date, stage, total, open_count, pending_count, resolved_count)
        SELECT v_user, v_date, t.stage, t.total, t.open_count, t.pending_count, t.resolved_count
        FROM public.compute_crm_stage_counts(v_user, v_date) t
        ON CONFLICT (user_id, snapshot_date, stage) DO UPDATE
            SET total = EXCLUDED.total,
                open_count = EXCLUDED.open_count,
                pending_count = EXCLUDED.pending_count,
                resolved_count = EXCLUDED.resolved_count,
                created_at = now();
    END LOOP;
END $$;

-- ── 6) Schedule daily at 23:59 BRT (02:59 UTC) ──
DO $$
BEGIN
    PERFORM cron.unschedule('crm-daily-snapshot');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'crm-daily-snapshot',
    '59 2 * * *',
    $$SELECT public.capture_crm_daily_snapshots()$$
);
