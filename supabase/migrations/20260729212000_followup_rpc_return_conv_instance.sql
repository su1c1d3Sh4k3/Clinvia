-- api-followup-pending: retorno passa a incluir user_id, conversation_id e
-- instance_id (da conversa pendente na fila 'Atendimento IA' — a mesma que
-- habilita o contato ao follow-up; se houver mais de uma, a mais recente).
-- RETURNS TABLE muda → precisa DROP + CREATE.

DROP FUNCTION IF EXISTS public.get_followup_pending_contacts(uuid, integer, integer);

CREATE FUNCTION public.get_followup_pending_contacts(
  p_user_id uuid,
  p_minutes integer,
  p_follow_number integer DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  number text,
  push_name text,
  last_message text,
  last_message_time text,
  follow_number integer,
  user_id uuid,
  conversation_id uuid,
  instance_id uuid
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.number,
    c.push_name,
    c.last_message,
    TO_CHAR(
      c.last_message_time AT TIME ZONE 'America/Sao_Paulo',
      'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
    ) AS last_message_time,
    c.follow_number,
    c.user_id,
    conv.conv_id,
    conv.conv_instance_id
  FROM contacts c
  JOIN LATERAL (
    SELECT cv.id AS conv_id, cv.instance_id AS conv_instance_id
    FROM conversations cv
    JOIN queues q ON q.id = cv.queue_id
    WHERE cv.contact_id = c.id
      AND cv.user_id = p_user_id
      AND cv.status = 'pending'
      AND q.name = 'Atendimento IA'
    ORDER BY cv.last_message_at DESC NULLS LAST
    LIMIT 1
  ) conv ON TRUE
  WHERE c.user_id = p_user_id
    AND c.ia_on = TRUE
    AND c.last_message = 'enviada'
    AND c.is_group = FALSE
    AND c.last_message_time < (NOW() - (p_minutes || ' minutes')::INTERVAL)
    AND (p_follow_number IS NULL OR c.follow_number = p_follow_number)
    AND NOT EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.contact_id = c.id
        AND cc.user_id = p_user_id
        AND cc.is_active = TRUE
        AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
    );
END;
$function$;
