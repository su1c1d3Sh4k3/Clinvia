-- Gate de IA no sync etapa -> fila: conversas só vão para a fila 'Atendimento IA'
-- se a IA estiver efetivamente ligada (ia_config.ia_on = true E a instância da
-- conversa com ia_on_wpp = true). Caso contrário (IA desligada, sem ia_config,
-- ou instância com IA off), a fila alvo é 'Atendimento Humano'.
CREATE OR REPLACE FUNCTION public.sync_queue_from_crm_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_queue_name TEXT;
  v_queue_id UUID;
  v_humano_id UUID;
  v_ia_on BOOLEAN;
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
    ELSE NULL -- etapas terminais / desconhecidas: não mexe na fila
  END;

  IF v_queue_name IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_queue_name = 'Atendimento IA' THEN
    SELECT COALESCE(ic.ia_on, FALSE) INTO v_ia_on
    FROM ia_config ic WHERE ic.user_id = NEW.user_id;

    IF v_ia_on IS NOT TRUE THEN
      -- IA desligada ou sem ia_config: tudo vai para Atendimento Humano
      v_queue_name := 'Atendimento Humano';
    ELSE
      -- IA ligada: instâncias com ia_on_wpp = false vão para Atendimento Humano;
      -- as demais (ia_on_wpp = true ou sem instância) vão para Atendimento IA
      SELECT q.id INTO v_humano_id
      FROM queues q
      WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento Humano'
      LIMIT 1;

      IF v_humano_id IS NOT NULL THEN
        UPDATE conversations c
        SET queue_id = v_humano_id, updated_at = NOW()
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('pending', 'open')
          AND c.queue_id IS DISTINCT FROM v_humano_id
          AND c.instance_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM instances i
            WHERE i.id = c.instance_id AND COALESCE(i.ia_on_wpp, FALSE) = FALSE
          );
      END IF;

      SELECT q.id INTO v_queue_id
      FROM queues q
      WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento IA'
      LIMIT 1;

      IF v_queue_id IS NOT NULL THEN
        UPDATE conversations c
        SET queue_id = v_queue_id, updated_at = NOW()
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('pending', 'open')
          AND c.queue_id IS DISTINCT FROM v_queue_id
          AND (
            c.instance_id IS NULL
            OR EXISTS (
              SELECT 1 FROM instances i
              WHERE i.id = c.instance_id AND i.ia_on_wpp = TRUE
            )
          );
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  SELECT q.id INTO v_queue_id
  FROM queues q
  WHERE q.user_id = NEW.user_id AND q.name = v_queue_name
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE conversations c
  SET queue_id = v_queue_id, updated_at = NOW()
  WHERE c.contact_id = NEW.contact_id
    AND c.user_id = NEW.user_id
    AND c.status IN ('pending', 'open')
    AND c.queue_id IS DISTINCT FROM v_queue_id;

  RETURN NEW;
END;
$function$;

-- Data fix (2 statements — NÃO usar CTE: os AFTER triggers do UPDATE dentro
-- do CTE disparam só no fim do statement, DEPOIS do restore, desfazendo-o):
-- 1) conversas na fila 'Atendimento IA' de usuários sem IA efetiva
--    (sem ia_config.ia_on = true) voltam para 'Atendimento Humano'.
UPDATE conversations c
SET queue_id = qh.id, updated_at = NOW()
FROM queues qia
JOIN queues qh ON qh.user_id = qia.user_id AND qh.name = 'Atendimento Humano'
WHERE qia.name = 'Atendimento IA'
  AND c.queue_id = qia.id
  AND c.user_id = qia.user_id
  AND c.status IN ('pending', 'open')
  AND NOT EXISTS (
    SELECT 1 FROM ia_config ic
    WHERE ic.user_id = c.user_id AND ic.ia_on = TRUE
  );

-- 2) o trigger reverso (fila -> etapa) devolveu cards para
--    'Em Atendimento Humano'; restaura 'Agendado' para contatos com
--    agendamento ativo. O sync etapa->fila resultante converge (gate manda
--    para Humano, onde a conversa já está).
UPDATE crm_client k
SET stage = 'Agendado', stage_changed_at = NOW(), updated_at = NOW()
WHERE k.is_active = TRUE
  AND k.stage = 'Em Atendimento Humano'
  AND NOT EXISTS (
    SELECT 1 FROM ia_config ic
    WHERE ic.user_id = k.user_id AND ic.ia_on = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.contact_id = k.contact_id AND a.user_id = k.user_id
      AND a.type = 'appointment'
      AND a.status IN ('pending', 'confirmed', 'waiting', 'rescheduled')
  );
