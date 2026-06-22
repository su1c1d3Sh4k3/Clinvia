-- Adicionar follow_number aos contatos (0, 1, 2)
-- Resetado para 0 quando cliente envia mensagem (last_message muda para 'recebida')

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_number INTEGER DEFAULT 0;
UPDATE contacts SET follow_number = 0 WHERE follow_number IS NULL;

-- Atualizar RPC com filtro por follow_number
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
        AND conv.status IN ('pending', 'open')
        AND q.name = 'Atendimento IA'
    );
END;
$$ LANGUAGE plpgsql STABLE;
