-- Fila do Instagram = mesma regra do WhatsApp (user rule 2026-09-21)
--
-- A conta de Instagram deixa de escolher fila: conversa nova entra em
-- 'Atendimento IA' quando ia_config.ia_on E instagram_instances.ia_on_insta
-- estao ligados, senao em 'Atendimento Humano' — exatamente como
-- instances.ia_on_wpp faz no WhatsApp.

-- 1) Guard universal passa a cobrir o Instagram.
--    Antes: instance_id NULL (= Instagram) saia sem validacao nenhuma, entao
--    qualquer escrita podia jogar a conversa na fila IA com a IA desligada.
CREATE OR REPLACE FUNCTION public.conv_ia_queue_requires_ia_on()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_humano UUID;
    v_ia_efetiva BOOLEAN;
BEGIN
    -- sem fila, ou conversa sem canal nenhum (legado): nada a validar
    IF NEW.queue_id IS NULL
       OR (NEW.instance_id IS NULL AND NEW.instagram_instance_id IS NULL) THEN
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

    -- IA efetiva = disjuntor da conta + switch DA CONEXAO daquela conversa
    v_ia_efetiva := EXISTS (
        SELECT 1 FROM ia_config ic WHERE ic.user_id = NEW.user_id AND ic.ia_on IS TRUE
    ) AND (
        CASE
            WHEN NEW.instance_id IS NOT NULL THEN EXISTS (
                SELECT 1 FROM instances i
                WHERE i.id = NEW.instance_id AND i.ia_on_wpp IS TRUE
            )
            ELSE EXISTS (
                SELECT 1 FROM instagram_instances ig
                WHERE ig.id = NEW.instagram_instance_id AND ig.ia_on_insta IS TRUE
            )
        END
    );

    IF v_ia_efetiva THEN
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
END
$$;

-- 2) Desligar a IA da conta de Instagram devolve as conversas abertas dela
--    para 'Atendimento Humano' (espelho de instance_ia_off_moves_convs).
CREATE OR REPLACE FUNCTION public.instagram_instance_ia_off_moves_convs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_humano UUID;
BEGIN
    IF NEW.ia_on_insta IS NOT DISTINCT FROM OLD.ia_on_insta OR NEW.ia_on_insta IS TRUE THEN
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
    WHERE c.instagram_instance_id = NEW.id
      AND c.status IN ('open', 'pending')
      AND EXISTS (SELECT 1 FROM queues q WHERE q.id = c.queue_id AND q.name = 'Atendimento IA');

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_instagram_instance_ia_off_moves_convs ON public.instagram_instances;
CREATE TRIGGER trg_instagram_instance_ia_off_moves_convs
AFTER UPDATE OF ia_on_insta ON public.instagram_instances
FOR EACH ROW
EXECUTE FUNCTION public.instagram_instance_ia_off_moves_convs();

-- 3) Correcao unica: conversa de Instagram aberta na fila IA sem IA efetiva
--    volta para Humano (o guard so age em escrita nova).
UPDATE conversations c
SET queue_id = h.id, updated_at = NOW()
FROM queues h
WHERE h.user_id = c.user_id
  AND h.name = 'Atendimento Humano'
  AND c.instance_id IS NULL
  AND c.instagram_instance_id IS NOT NULL
  AND c.status IN ('open', 'pending')
  AND EXISTS (SELECT 1 FROM queues q WHERE q.id = c.queue_id AND q.name = 'Atendimento IA')
  AND NOT (
      EXISTS (SELECT 1 FROM ia_config ic WHERE ic.user_id = c.user_id AND ic.ia_on IS TRUE)
      AND EXISTS (
          SELECT 1 FROM instagram_instances ig
          WHERE ig.id = c.instagram_instance_id AND ig.ia_on_insta IS TRUE
      )
  );

-- 4) A coluna morre junto com o campo da tela (instances.default_queue_id ja
--    tinha sido dropada quando a regra virou por nome no WhatsApp).
ALTER TABLE public.instagram_instances DROP COLUMN IF EXISTS default_queue_id;
