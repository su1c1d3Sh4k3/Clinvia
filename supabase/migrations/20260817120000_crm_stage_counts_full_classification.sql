-- CRM dashboard: Aberto/Pendente/Concluído must sum to the stage total.
-- Before: "Concluído" only counted conversations resolved ON the given date,
-- so cards whose conversations were resolved on previous days were counted in
-- the total but appeared in none of the three status lines (case fernando-costa:
-- 745 total vs 49+210+181). Now each active card is classified by its contact's
-- most recent conversation (active conversations take priority):
--   open → Aberto, pending → Pendente, resolved (any day) → Concluído.
-- Cards whose contact has no conversation at all also fall into Concluído so the
-- breakdown always sums to the total. p_date kept in the signature for the daily
-- snapshot cron (capture_crm_daily_snapshots) compatibility.

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
latest_conv AS (
    SELECT DISTINCT ON (c.contact_id) c.contact_id, c.status
    FROM conversations c
    WHERE c.user_id = p_user_id
    ORDER BY c.contact_id,
             (c.status IN ('open', 'pending')) DESC,
             c.created_at DESC
)
SELECT d.s AS stage,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE lc.status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE lc.status = 'pending')::int AS pending_count,
       COUNT(*) FILTER (WHERE lc.status IS NULL OR lc.status NOT IN ('open', 'pending'))::int AS resolved_count
FROM deals d
LEFT JOIN latest_conv lc ON lc.contact_id = d.contact_id
GROUP BY d.s;
$$;
