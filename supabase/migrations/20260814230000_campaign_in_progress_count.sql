-- Card "Em Atendimento": entradas enviadas ainda vivas (sem congelamento).
-- get_campaign_dashboard_stats passa a retornar 12 colunas (+in_progress_count).

DROP FUNCTION IF EXISTS public.get_campaign_dashboard_stats(timestamptz, timestamptz);
CREATE FUNCTION public.get_campaign_dashboard_stats(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(campaign_id UUID, total_contacts INTEGER, valid_contacts INTEGER,
              sent_count INTEGER, delivered_count INTEGER, failed_count INTEGER,
              responded_count INTEGER, converted_count INTEGER,
              scheduled_count INTEGER, resolved_count INTEGER, no_response_count INTEGER,
              in_progress_count INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH camps AS (
    SELECT c.id, c.scheduled_at, c.valid_until
    FROM campaigns c
    WHERE c.user_id = public.get_owner_id()
      AND (p_from IS NULL OR c.scheduled_at >= p_from)
      AND (p_to   IS NULL OR c.scheduled_at <= p_to)
)
SELECT
    cc.campaign_id,
    COUNT(*)::int                                              AS total_contacts,
    COUNT(*) FILTER (WHERE cc.status <> 'invalid')::int        AS valid_contacts,
    COUNT(*) FILTER (WHERE cc.status = 'sent')::int            AS sent_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'sent' AND (
            cc.message_status IN ('delivered', 'read')
            OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.id = cc.message_id AND m.status IN ('delivered', 'read')
            )
        ))::int                                                AS delivered_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'failed' OR (cc.status = 'sent' AND (
            cc.message_status = 'failed'
            OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.id = cc.message_id AND m.status = 'failed'
            )
        )))::int                                               AS failed_count,
    COUNT(*) FILTER (
        WHERE (cc.frozen_at IS NOT NULL AND cc.frozen_responded)
           OR (cc.frozen_at IS NULL AND cc.status = 'sent'
               AND public.campaign_contact_responded(cc.contact_id, cc.sent_at))
        )::int                                                 AS responded_count,
    COUNT(*) FILTER (
        WHERE cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        ))::int                                                AS converted_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_at IS NOT NULL AND cc.frozen_scheduled)::int AS scheduled_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_reason = 'resolved')::int              AS resolved_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_at IS NOT NULL
          AND NOT COALESCE(cc.frozen_responded, FALSE))::int   AS no_response_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'sent' AND cc.frozen_at IS NULL)::int AS in_progress_count
FROM campaign_contacts cc
JOIN camps cp ON cp.id = cc.campaign_id
GROUP BY cc.campaign_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_campaign_dashboard_stats(timestamptz, timestamptz) TO authenticated;
