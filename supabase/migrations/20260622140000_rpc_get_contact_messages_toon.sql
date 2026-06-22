-- RPC: retorna ultimas 10 mensagens de um contato em formato TOON compacto
-- Formato: ROLE|DD/MM HH:MI|mensagem
-- Roles: C = Cliente, IA = IA, A = Agente humano

CREATE OR REPLACE FUNCTION get_contact_messages_toon(p_contact_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT
      CASE m.direction
        WHEN 'inbound' THEN 'C'
        WHEN 'outbound' THEN
          CASE WHEN m.is_ai_response = true THEN 'IA' ELSE 'A' END
      END AS role,
      COALESCE(m.body, m.transcription, '[' || m.message_type || ']') AS msg,
      TO_CHAR(
        m.created_at AT TIME ZONE 'America/Sao_Paulo',
        'DD/MM HH24:MI'
      ) AS ts
    FROM messages m
    JOIN conversations conv ON conv.id = m.conversation_id
    WHERE conv.contact_id = p_contact_id
      AND m.is_deleted IS DISTINCT FROM true
    ORDER BY m.created_at DESC
    LIMIT 10
  LOOP
    v_result := v_row.role || '|' || v_row.ts || '|' || v_row.msg || E'\n' || v_result;
  END LOOP;

  RETURN RTRIM(v_result, E'\n');
END;
$$ LANGUAGE plpgsql STABLE;
