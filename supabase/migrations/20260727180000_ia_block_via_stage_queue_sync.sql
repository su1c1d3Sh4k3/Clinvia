-- Bloqueio temporário da IA via etapa/fila:
-- 1. contacts.ia_on vira toggle EXCLUSIVAMENTE manual (nenhum trigger o altera)
-- 2. Sync bidirecional etapa CRM <-> fila da conversa
-- 3. Ticket aberto na fila Atendimento IA -> fila Atendimento Humano + etapa Em Atendimento Humano
-- 4. Follow-up automático só com ticket pending (fila Atendimento IA)
-- 5. Data fix: religa todos os contatos com ia_on = false

-- ─── 1. Remove o trigger antigo que mutava contacts.ia_on ───
DROP TRIGGER IF EXISTS trg_sync_contact_ia_on ON public.crm_client;
DROP FUNCTION IF EXISTS public.sync_contact_ia_on_from_crm();

-- ─── 2. Etapa -> fila (sem tocar em contacts.ia_on) ───
CREATE OR REPLACE FUNCTION public.sync_queue_from_crm_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_queue_name TEXT;
  v_queue_id UUID;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  v_queue_name := CASE NEW.stage
    WHEN 'Em Atendimento Humano' THEN 'Atendimento Humano'
    WHEN 'Suporte' THEN 'Suporte'
    WHEN 'Financeiro' THEN 'Financeiro'
    WHEN 'Pós-Venda' THEN 'Pós-Venda'
    WHEN 'Em Atendimento IA' THEN 'Atendimento IA'
    WHEN 'Qualificado' THEN 'Atendimento IA'
    WHEN 'Agendado' THEN 'Atendimento IA'
    WHEN 'Pesquisa de Satisfação' THEN 'Atendimento IA'
    WHEN 'Follow Up' THEN 'Atendimento IA'
    WHEN 'Recorrencia' THEN 'Atendimento IA'
    WHEN 'Sem Contato' THEN 'Atendimento IA'
    WHEN 'Sem Interesse' THEN 'Atendimento IA'
    ELSE NULL -- etapas terminais (Ganho/Perdido/Finalizado): não mexe na fila
  END;

  IF v_queue_name IS NULL THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_queue_from_crm_stage
  AFTER INSERT OR UPDATE ON public.crm_client
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_queue_from_crm_stage();

-- ─── 3. Ticket aberto na fila Atendimento IA -> fila Atendimento Humano ───
CREATE OR REPLACE FUNCTION public.conv_open_moves_to_humano()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_current_queue TEXT;
  v_humano_id UUID;
BEGIN
  IF NEW.status = 'open' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT q.name INTO v_current_queue FROM queues q WHERE q.id = NEW.queue_id;

    IF v_current_queue = 'Atendimento IA' THEN
      SELECT q.id INTO v_humano_id
      FROM queues q
      WHERE q.name = 'Atendimento Humano' AND q.user_id = NEW.user_id
      LIMIT 1;

      IF v_humano_id IS NOT NULL THEN
        NEW.queue_id := v_humano_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_conv_open_to_humano
  BEFORE UPDATE OF status ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.conv_open_moves_to_humano();

-- ─── 4. Fila -> etapa do card ativo ───
CREATE OR REPLACE FUNCTION public.sync_crm_stage_from_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_queue_name TEXT;
  v_stage TEXT;
BEGIN
  IF OLD.queue_id IS NOT DISTINCT FROM NEW.queue_id THEN
    RETURN NEW;
  END IF;

  SELECT q.name INTO v_queue_name FROM queues q WHERE q.id = NEW.queue_id;

  v_stage := CASE v_queue_name
    WHEN 'Atendimento Humano' THEN 'Em Atendimento Humano'
    WHEN 'Suporte' THEN 'Suporte'
    WHEN 'Financeiro' THEN 'Financeiro'
    WHEN 'Pós-Venda' THEN 'Pós-Venda'
    WHEN 'Atendimento IA' THEN 'Em Atendimento IA'
    ELSE NULL -- filas custom: não mexe na etapa
  END;

  IF v_stage IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE crm_client
  SET stage = v_stage, stage_changed_at = NOW(), updated_at = NOW()
  WHERE contact_id = NEW.contact_id
    AND user_id = NEW.user_id
    AND is_active = TRUE
    AND stage IS DISTINCT FROM v_stage;

  RETURN NEW;
END;
$function$;

-- Sem "OF queue_id": o BEFORE trigger acima pode alterar queue_id em updates de
-- status, e "UPDATE OF col" só dispara se a coluna estiver no SET do comando.
CREATE TRIGGER trg_sync_crm_stage_from_queue
  AFTER UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_crm_stage_from_queue();

-- ─── 5. Follow-up: só com ticket pending (fila Atendimento IA) ───
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
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 6. Data fix: religa todos os contatos desligados pelo trigger antigo ───
UPDATE contacts SET ia_on = TRUE, updated_at = NOW() WHERE ia_on = FALSE;
