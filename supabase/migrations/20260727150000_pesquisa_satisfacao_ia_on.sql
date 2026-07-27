-- 1. Nova etapa "Pesquisa de Satisfação" no CHECK do crm_client.stage
ALTER TABLE public.crm_client DROP CONSTRAINT IF EXISTS crm_client_stage_check;
ALTER TABLE public.crm_client ADD CONSTRAINT crm_client_stage_check
  CHECK (stage = ANY (ARRAY[
    'Em Atendimento Humano'::text,
    'Em Atendimento IA'::text,
    'Qualificado'::text,
    'Agendado'::text,
    'Pesquisa de Satisfação'::text,
    'Suporte'::text,
    'Financeiro'::text,
    'Pós-Venda'::text,
    'Recorrencia'::text,
    'Follow Up'::text,
    'Sem Contato'::text,
    'Sem Interesse'::text,
    'Ganho'::text,
    'Perdido'::text,
    'Finalizado'::text
  ]));

-- 2. Trigger: etapa "Agendado" (e "Pesquisa de Satisfação") NÃO desligam mais a IA
CREATE OR REPLACE FUNCTION public.sync_contact_ia_on_from_crm()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_ia_on BOOLEAN;
  v_queue_name TEXT;
  v_queue_id UUID;
BEGIN
  -- Only these 4 stages change the conversation queue
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
      -- All other stages: update ia_on only, NEVER change queue
      v_ia_on := CASE
        WHEN NEW.stage IN ('Em Atendimento IA', 'Qualificado', 'Agendado', 'Pesquisa de Satisfação', 'Follow Up', 'Recorrencia', 'Sem Contato', 'Sem Interesse') THEN TRUE
        ELSE FALSE
      END;
      v_queue_name := NULL;
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
$function$;

-- 3. Data fix: reativa a IA de contatos quebrados pela regra antiga
--    (card ativo em "Agendado" + conversa aberta/pendente na fila Atendimento IA + ia desligada)
UPDATE contacts ct
SET ia_on = TRUE, updated_at = NOW()
FROM crm_client cc, conversations cv, queues q
WHERE cc.contact_id = ct.id
  AND cc.is_active = TRUE
  AND cc.stage = 'Agendado'
  AND cv.contact_id = ct.id
  AND cv.user_id = cc.user_id
  AND cv.status IN ('pending', 'open')
  AND cv.queue_id = q.id
  AND q.name = 'Atendimento IA'
  AND ct.ia_on = FALSE;
