-- Campaign dashboard: agregados por campanha (enviadas/entregues/erros/respondidas/convertidas)
-- Consumido pela aba "Campanhas" do Dashboard via RPC.

-- Índices de apoio (respostas inbound por conversa e conversão por contato)
CREATE INDEX IF NOT EXISTS idx_messages_conv_inbound_created
    ON public.messages (conversation_id, created_at)
    WHERE direction = 'inbound';

CREATE INDEX IF NOT EXISTS idx_appointments_contact_created
    ON public.appointments (contact_id, created_at);

CREATE OR REPLACE FUNCTION public.get_campaign_dashboard_stats(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    campaign_id UUID,
    total_contacts INT,
    valid_contacts INT,
    sent_count INT,
    delivered_count INT,
    failed_count INT,
    responded_count INT,
    converted_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
        WHERE cc.status = 'sent' AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.id = cc.message_id AND m.status IN ('delivered', 'read')
        ))::int                                                AS delivered_count,
    COUNT(*) FILTER (WHERE cc.status = 'failed')::int          AS failed_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'sent' AND cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM conversations cv
            JOIN messages m ON m.conversation_id = cv.id
            WHERE cv.contact_id = cc.contact_id
              AND m.direction = 'inbound'
              AND m.created_at > cc.sent_at
        ))::int                                                AS responded_count,
    COUNT(*) FILTER (
        WHERE cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        ))::int                                                AS converted_count
FROM campaign_contacts cc
JOIN camps cp ON cp.id = cc.campaign_id
GROUP BY cc.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
