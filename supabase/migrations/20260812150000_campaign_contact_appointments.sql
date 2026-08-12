-- RPC: status de agendamento por contato de campanha — "Agendado" quando o contato
-- possui appointment CRIADO após o envio da campanha (created_at > sent_at).
-- Cancelados/no-show contam (decisão do usuário). Mesmo padrão de get_campaign_contact_responses.
CREATE OR REPLACE FUNCTION public.get_campaign_contact_appointments(p_campaign_id uuid)
RETURNS TABLE(campaign_contact_id uuid, scheduled boolean)
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
            FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at > cc.sent_at
        )
    ) AS scheduled
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;
