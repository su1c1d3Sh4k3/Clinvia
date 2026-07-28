-- Follow-up: exclui contatos cujo card ativo do CRM está em
-- Agendado, Sem Interesse, Sem Contato ou Pesquisa de Satisfação.
-- (Contato sem card ativo continua elegível.)

CREATE OR REPLACE FUNCTION get_followup_pending_contacts(
  p_user_id UUID,
  p_minutes INTEGER
)
RETURNS TABLE (
  id UUID,
  number TEXT,
  push_name TEXT,
  last_message TEXT,
  last_message_time TEXT
) AS $$
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
    ) AS last_message_time
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.ia_on = TRUE
    AND c.last_message = 'enviada'
    AND c.is_group = FALSE
    AND c.last_message_time < (NOW() - (p_minutes || ' minutes')::INTERVAL)
    AND EXISTS (
      SELECT 1 FROM conversations conv
      JOIN queues q ON q.id = conv.queue_id
      WHERE conv.contact_id = c.id
        AND conv.user_id = p_user_id
        AND conv.status = 'pending'
        AND q.name = 'Atendimento IA'
    )
    AND NOT EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.contact_id = c.id
        AND cc.user_id = p_user_id
        AND cc.is_active = TRUE
        AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_followup_pending_contacts(
  p_user_id UUID,
  p_minutes INTEGER,
  p_follow_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  number TEXT,
  push_name TEXT,
  last_message TEXT,
  last_message_time TEXT,
  follow_number INTEGER
) AS $$
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
    c.follow_number
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.ia_on = TRUE
    AND c.last_message = 'enviada'
    AND c.is_group = FALSE
    AND c.last_message_time < (NOW() - (p_minutes || ' minutes')::INTERVAL)
    AND (p_follow_number IS NULL OR c.follow_number = p_follow_number)
    AND EXISTS (
      SELECT 1 FROM conversations conv
      JOIN queues q ON q.id = conv.queue_id
      WHERE conv.contact_id = c.id
        AND conv.user_id = p_user_id
        AND conv.status = 'pending'
        AND q.name = 'Atendimento IA'
    )
    AND NOT EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.contact_id = c.id
        AND cc.user_id = p_user_id
        AND cc.is_active = TRUE
        AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
    );
END;
$$ LANGUAGE plpgsql STABLE;
