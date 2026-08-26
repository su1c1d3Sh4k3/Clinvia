-- REGRA DO USUÁRIO (2026-08-26): com duas ou mais instâncias ativas e só uma
-- com a IA ligada, SÓ as conversas da instância ligada podem ficar na fila
-- 'Atendimento IA'. As demais vão para 'Atendimento Humano'.
--
-- Antes existiam escritores que escolhiam a fila sem olhar a instância da
-- conversa: campaign-dispatch e monitoring_register_match usavam apenas
-- campaigns.ia_enabled. Resultado: conversa parada na fila IA numa instância
-- sem IA — o gate de encaminhamento ao n8n barra a mensagem (correto), mas
-- ninguém da equipe vê o card, porque ele fica na fila da IA.

-- 1) Guarda universal: qualquer escrita que ponha a conversa na fila
--    'Atendimento IA' sem IA efetiva (ia_config.ia_on E instances.ia_on_wpp)
--    é redirecionada para 'Atendimento Humano'. Conversa sem instância
--    (Instagram) não é tocada — o canal dela tem regra própria.
CREATE OR REPLACE FUNCTION public.conv_ia_queue_requires_ia_on()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_humano UUID;
BEGIN
    IF NEW.queue_id IS NULL OR NEW.instance_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.queue_id IS NOT DISTINCT FROM OLD.queue_id THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM queues q WHERE q.id = NEW.queue_id AND q.name = 'Atendimento IA'
    ) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM ia_config ic WHERE ic.user_id = NEW.user_id AND ic.ia_on IS TRUE)
       AND EXISTS (SELECT 1 FROM instances i WHERE i.id = NEW.instance_id AND i.ia_on_wpp IS TRUE)
    THEN
        RETURN NEW;
    END IF;

    SELECT q.id INTO v_humano
    FROM queues q
    WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento Humano'
    LIMIT 1;

    IF v_humano IS NOT NULL THEN
        NEW.queue_id := v_humano;
    END IF;

    RETURN NEW;
END $function$;

COMMENT ON FUNCTION public.conv_ia_queue_requires_ia_on() IS
    'Conversa só entra na fila Atendimento IA se a IA estiver ligada na conta (ia_config.ia_on) E na instância da conversa (instances.ia_on_wpp). Caso contrário cai em Atendimento Humano.';

-- nome zz_* para rodar por último entre os BEFORE (vê a fila final decidida
-- pelos outros triggers, ex.: trg_conv_open_to_humano)
DROP TRIGGER IF EXISTS zz_conv_ia_queue_guard ON public.conversations;
CREATE TRIGGER zz_conv_ia_queue_guard
    BEFORE INSERT OR UPDATE OF queue_id ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.conv_ia_queue_requires_ia_on();

-- 2) Desligar a IA de uma instância tira os atendimentos dela da fila da IA
--    (o sync reverso fila→etapa move o card para 'Em Atendimento Humano').
CREATE OR REPLACE FUNCTION public.instance_ia_off_moves_convs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_humano UUID;
BEGIN
    IF NEW.ia_on_wpp IS NOT DISTINCT FROM OLD.ia_on_wpp OR NEW.ia_on_wpp IS TRUE THEN
        RETURN NEW;
    END IF;

    SELECT q.id INTO v_humano
    FROM queues q
    WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento Humano'
    LIMIT 1;

    IF v_humano IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE conversations c
    SET queue_id = v_humano, updated_at = NOW()
    WHERE c.instance_id = NEW.id
      AND c.status IN ('open', 'pending')
      AND EXISTS (SELECT 1 FROM queues q WHERE q.id = c.queue_id AND q.name = 'Atendimento IA');

    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_instance_ia_off_moves_convs ON public.instances;
CREATE TRIGGER trg_instance_ia_off_moves_convs
    AFTER UPDATE OF ia_on_wpp ON public.instances
    FOR EACH ROW
    EXECUTE FUNCTION public.instance_ia_off_moves_convs();

-- 3) Backfill: conversas abertas/pendentes já paradas na fila da IA em
--    instâncias sem IA voltam para Atendimento Humano.
UPDATE conversations c
SET queue_id = qh.id, updated_at = NOW()
FROM queues qia
JOIN queues qh ON qh.user_id = qia.user_id AND qh.name = 'Atendimento Humano'
WHERE qia.name = 'Atendimento IA'
  AND c.queue_id = qia.id
  AND c.user_id = qia.user_id
  AND c.status IN ('open', 'pending')
  AND c.instance_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM instances i
      WHERE i.id = c.instance_id AND i.ia_on_wpp IS TRUE
  );
