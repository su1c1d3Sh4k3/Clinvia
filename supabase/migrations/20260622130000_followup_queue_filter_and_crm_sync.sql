-- =============================================
-- Migration: Filtro de fila na API + sync CRM->fila + cleanup filas
-- 1. Atualizar RPC para filtrar apenas fila 'Atendimento IA'
-- 2. Atualizar trigger CRM para mover conversa para fila correspondente
-- 3. Deletar filas obsoletas
-- Data: 2026-06-22
-- =============================================

-- 1. Mover conversas de 'Cliente Ativo' para 'Atendimento Humano'
UPDATE conversations c
SET queue_id = (
  SELECT q2.id FROM queues q2
  WHERE q2.name = 'Atendimento Humano' AND q2.user_id = c.user_id
  LIMIT 1
)
FROM queues q
WHERE c.queue_id = q.id
AND q.name = 'Cliente Ativo';

-- 2. Deletar filas obsoletas
DELETE FROM queues WHERE name IN ('Delivery', 'Cliente Ativo', 'Pós Venda');

-- 3. Atualizar RPC: filtrar apenas contatos na fila 'Atendimento IA'
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
        AND conv.status IN ('pending', 'open')
        AND q.name = 'Atendimento IA'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Atualizar trigger: sync CRM stage -> contacts.ia_on + mover conversa para fila
CREATE OR REPLACE FUNCTION sync_contact_ia_on_from_crm()
RETURNS TRIGGER AS $$
DECLARE
  v_ia_on BOOLEAN;
  v_queue_name TEXT;
  v_queue_id UUID;
BEGIN
  CASE NEW.stage
    WHEN 'Em Atendimento Humano' THEN
      v_ia_on := FALSE; v_queue_name := 'Atendimento Humano';
    WHEN 'Suporte' THEN
      v_ia_on := FALSE; v_queue_name := 'Suporte';
    WHEN 'Financeiro' THEN
      v_ia_on := FALSE; v_queue_name := 'Financeiro';
    WHEN 'Pós-Venda' THEN
      v_ia_on := FALSE; v_queue_name := 'Pós-Venda';
    ELSE
      v_ia_on := TRUE; v_queue_name := 'Atendimento IA';
  END CASE;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    UPDATE contacts
    SET ia_on = v_ia_on, updated_at = NOW()
    WHERE id = NEW.contact_id;

    SELECT q.id INTO v_queue_id
    FROM queues q
    WHERE q.name = v_queue_name AND q.user_id = NEW.user_id
    LIMIT 1;

    IF v_queue_id IS NOT NULL THEN
      UPDATE conversations
      SET queue_id = v_queue_id, updated_at = NOW()
      WHERE contact_id = NEW.contact_id
        AND user_id = NEW.user_id
        AND status IN ('pending', 'open')
        AND queue_id IS DISTINCT FROM v_queue_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
