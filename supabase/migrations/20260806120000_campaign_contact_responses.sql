-- RPC: status de resposta por contato de campanha (mesmo critério do responded_count
-- em get_campaign_dashboard_stats: msg inbound do contato após o envio)
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
            JOIN messages m ON m.conversation_id = cv.id
            WHERE cv.contact_id = cc.contact_id
              AND m.direction = 'inbound'
              AND m.created_at > cc.sent_at
        )
    ) AS responded
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;
