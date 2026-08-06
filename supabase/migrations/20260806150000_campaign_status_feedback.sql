-- Feedback real de status por contato de campanha:
-- Pendente (pending) → Enviada (sent) → Entregue (msg delivered/read) → Rejeitada (failed ou msg failed)
-- 1) FK campaign_contacts.message_id → messages para o join PostgREST no frontend
-- 2) failed_count do dashboard passa a incluir falhas assíncronas da Meta (msg status = failed)

-- Limpa referências órfãs antes da FK
UPDATE public.campaign_contacts cc SET message_id = NULL
WHERE cc.message_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.id = cc.message_id);

ALTER TABLE public.campaign_contacts
    DROP CONSTRAINT IF EXISTS campaign_contacts_message_id_fkey;
ALTER TABLE public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_message_id
    ON public.campaign_contacts (message_id) WHERE message_id IS NOT NULL;

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
    COUNT(*) FILTER (
        WHERE cc.status = 'failed' OR (cc.status = 'sent' AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.id = cc.message_id AND m.status = 'failed'
        )))::int                                               AS failed_count,
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

NOTIFY pgrst, 'reload schema';
