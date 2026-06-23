-- Fix: CRM stage "Agendado" should NOT move conversation queue to "Atendimento IA"
-- When appointment is confirmed and CRM moves to "Agendado", the queue must stay unchanged
-- (e.g. remain in "Pós-Venda" during the confirmation flow)

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
    WHEN 'Agendado' THEN
      v_ia_on := FALSE; v_queue_name := NULL;
    ELSE
      v_ia_on := TRUE; v_queue_name := 'Atendimento IA';
  END CASE;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    UPDATE contacts
    SET ia_on = v_ia_on, updated_at = NOW()
    WHERE id = NEW.contact_id;

    IF v_queue_name IS NOT NULL THEN
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
