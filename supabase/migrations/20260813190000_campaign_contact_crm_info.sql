-- RPC: estágio CRM + atendente por contato de campanha (colunas Estágio/Atendente
-- na CampaignContactsTable). Mesmo padrão de get_campaign_contact_appointments.
-- stage  = card ativo em crm_client (mais recente); null se não houver
-- agent  = conversa ativa mais recente do contato: fila 'Atendimento IA' -> 'IA',
--          senão nome do team_member atribuído; null sem conversa ativa/atribuição
CREATE OR REPLACE FUNCTION public.get_campaign_contact_crm_info(p_campaign_id uuid)
RETURNS TABLE(campaign_contact_id uuid, stage text, agent text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT
    cc.id AS campaign_contact_id,
    crm.stage,
    CASE
        WHEN conv.queue_name = 'Atendimento IA' THEN 'IA'
        ELSE conv.agent_name
    END AS agent
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
LEFT JOIN LATERAL (
    SELECT k.stage
    FROM crm_client k
    WHERE k.contact_id = cc.contact_id
      AND k.is_active = true
    ORDER BY k.created_at DESC
    LIMIT 1
) crm ON true
LEFT JOIN LATERAL (
    SELECT q.name AS queue_name, tm.name AS agent_name
    FROM conversations cv
    LEFT JOIN queues q ON q.id = cv.queue_id
    LEFT JOIN team_members tm ON tm.id = cv.assigned_agent_id
    WHERE cv.contact_id = cc.contact_id
      AND cv.status IN ('open', 'pending')
    ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC
    LIMIT 1
) conv ON true
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;
