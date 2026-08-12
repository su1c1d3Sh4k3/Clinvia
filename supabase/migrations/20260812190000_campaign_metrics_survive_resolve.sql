-- Métricas de campanha NÃO podem ser perdidas quando a conversa é resolvida.
-- Contexto: trigger on_conversation_resolve DELETA messages ao resolver, e a FK
-- campaign_contacts.message_id é ON DELETE SET NULL — Entregue/Rejeitada viravam
-- "Enviada" e "Respondida" sumia (RPCs liam somente messages).
-- Fix:
--   1) snapshot campaign_contacts.message_status mantido por trigger em messages
--      (UPDATE OF status + BEFORE DELETE preserva o último status conhecido)
--   2) RPCs usam snapshot + conversations.messages_history (inbound arquivado)
--   3) backfill do snapshot a partir das messages ainda existentes

-- 1) Coluna snapshot + índice para os triggers
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS message_status text;
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_message_id
    ON public.campaign_contacts(message_id) WHERE message_id IS NOT NULL;

-- 2) Trigger de snapshot
CREATE OR REPLACE FUNCTION public.campaign_snapshot_message_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            UPDATE campaign_contacts SET message_status = NEW.status
            WHERE message_id = NEW.id;
        END IF;
        RETURN NEW;
    ELSE -- DELETE: preserva o último status antes da FK anular message_id
        UPDATE campaign_contacts SET message_status = COALESCE(OLD.status, message_status)
        WHERE message_id = OLD.id;
        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_snapshot_msg_status ON public.messages;
CREATE TRIGGER trg_campaign_snapshot_msg_status
AFTER UPDATE OF status ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.campaign_snapshot_message_status();

DROP TRIGGER IF EXISTS trg_campaign_snapshot_msg_delete ON public.messages;
CREATE TRIGGER trg_campaign_snapshot_msg_delete
BEFORE DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.campaign_snapshot_message_status();

-- 3) Backfill do snapshot com as messages que ainda existem
UPDATE public.campaign_contacts cc
SET message_status = m.status
FROM public.messages m
WHERE m.id = cc.message_id
  AND cc.message_status IS DISTINCT FROM m.status;

-- 4) RPC de respostas: também considera inbound arquivado em messages_history
CREATE OR REPLACE FUNCTION public.get_campaign_contact_responses(p_campaign_id uuid)
RETURNS TABLE(campaign_contact_id uuid, responded boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT
    cc.id AS campaign_contact_id,
    (
        cc.status = 'sent'
        AND cc.contact_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM conversations cv
            WHERE cv.contact_id = cc.contact_id
              AND (
                EXISTS (
                    SELECT 1 FROM messages m
                    WHERE m.conversation_id = cv.id
                      AND m.direction = 'inbound'
                      AND m.created_at > cc.sent_at
                )
                OR (
                    jsonb_typeof(cv.messages_history) = 'array'
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(cv.messages_history) e
                        WHERE e->>'role' = 'user'
                          AND e->>'created_at' IS NOT NULL
                          AND (e->>'created_at')::timestamptz > cc.sent_at
                    )
                )
              )
        )
    ) AS responded
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;

-- 5) RPC do dashboard: delivered/failed via snapshot (fallback messages),
--    responded via messages OU messages_history
CREATE OR REPLACE FUNCTION public.get_campaign_dashboard_stats(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, total_contacts integer, valid_contacts integer,
              sent_count integer, delivered_count integer, failed_count integer,
              responded_count integer, converted_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
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
        WHERE cc.status = 'sent' AND cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM conversations cv
            WHERE cv.contact_id = cc.contact_id
              AND (
                EXISTS (
                    SELECT 1 FROM messages m
                    WHERE m.conversation_id = cv.id
                      AND m.direction = 'inbound'
                      AND m.created_at > cc.sent_at
                )
                OR (
                    jsonb_typeof(cv.messages_history) = 'array'
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(cv.messages_history) e
                        WHERE e->>'role' = 'user'
                          AND e->>'created_at' IS NOT NULL
                          AND (e->>'created_at')::timestamptz > cc.sent_at
                    )
                )
              )
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
$function$;
