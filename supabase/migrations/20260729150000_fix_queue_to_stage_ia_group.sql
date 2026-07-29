-- Fix: fila 'Atendimento IA' mapeia para um GRUPO de etapas (Em Atendimento IA,
-- Qualificado, Agendado, Pesquisa de Satisfação, Follow Up, Recorrencia,
-- Sem Contato, Sem Interesse). O trigger fila->etapa sobrescrevia qualquer uma
-- dessas para 'Em Atendimento IA' quando a conversa entrava na fila IA —
-- ex.: mover card para Agendado (etapa->fila IA) fazia o reverso devolver o
-- card para 'Em Atendimento IA'. Agora, se a etapa atual já pertence ao grupo
-- da fila IA, ela é preservada.
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
    AND stage IS DISTINCT FROM v_stage
    -- fila IA: preserva etapas que já pertencem ao grupo da IA
    AND NOT (v_queue_name = 'Atendimento IA' AND stage IN (
      'Em Atendimento IA', 'Qualificado', 'Agendado', 'Pesquisa de Satisfação',
      'Follow Up', 'Recorrencia', 'Sem Contato', 'Sem Interesse'
    ));

  RETURN NEW;
END;
$function$;

-- Data fix: cards que foram devolvidos para 'Em Atendimento IA' no backfill de
-- hoje da PELE DERMATOLOGIA voltam para Agendado (contatos com agendamento ativo)
UPDATE crm_client k
SET stage = 'Agendado', stage_changed_at = NOW(), updated_at = NOW()
WHERE k.user_id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af'
  AND k.is_active = TRUE
  AND k.stage = 'Em Atendimento IA'
  AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.contact_id = k.contact_id AND a.user_id = k.user_id
      AND a.type = 'appointment'
      AND a.status IN ('pending','confirmed','waiting','rescheduled')
  );
