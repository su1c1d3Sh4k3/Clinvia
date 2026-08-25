-- Nova etapa CRM 'Aguardando Pagamento' (entre Qualificado e Agendado).
-- Regra (user): card movido p/ essa etapa => conversa vai p/ fila Atendimento
-- Humano (colaborador assume; IA solta a conversa pois o gate n8n exige fila IA).
--
-- 3 peças:
--   1. CHECK crm_client_stage_check ganha o novo valor
--   2. sync_queue_from_crm_stage: 'Aguardando Pagamento' -> fila 'Atendimento Humano'
--   3. sync_crm_stage_from_queue: guard anti-bounce — mover a conversa p/ fila
--      Atendimento Humano NÃO pode reescrever o card que acabou de ir para
--      'Aguardando Pagamento' (mesmo padrão do grupo da IA / f8a7299)

set lock_timeout = '5s';

alter table public.crm_client drop constraint if exists crm_client_stage_check;
alter table public.crm_client add constraint crm_client_stage_check check (
  stage = any (array[
    'Em Atendimento Humano'::text, 'Em Atendimento IA'::text, 'Qualificado'::text,
    'Aguardando Pagamento'::text, 'Agendado'::text, 'Pesquisa de Satisfação'::text,
    'Suporte'::text, 'Financeiro'::text, 'Pós-Venda'::text, 'Recorrencia'::text,
    'Follow Up'::text, 'Sem Contato'::text, 'Sem Interesse'::text, 'Ganho'::text,
    'Perdido'::text, 'Finalizado'::text
  ])
);

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
    WHEN 'Aguardando Pagamento' THEN 'Atendimento Humano'
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
    ))
    -- fila Humano: preserva 'Aguardando Pagamento' (a própria etapa mandou a
    -- conversa pra cá — sem este guard o trigger devolveria o card p/
    -- 'Em Atendimento Humano' na sequência)
    AND NOT (v_queue_name = 'Atendimento Humano' AND stage = 'Aguardando Pagamento');

  RETURN NEW;
END;
$function$;
