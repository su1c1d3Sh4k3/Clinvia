-- =============================================
-- CRM card ↔ conversation lifecycle (user rule, 2026-08-17):
--   1. Toda conversa (open/pending) garante um card ativo no CRM.
--   2. Toda conversa resolvida finaliza o card do contato (→ 'Finalizado',
--      inativo) QUANDO o contato não tem mais nenhuma conversa open/pending.
--      Fluxos que definem outro terminal (Ganho/Perdido/Sem Contato/Sem
--      Interesse) continuam valendo: neles o card já fica inativo antes/junto
--      da resolução, então este trigger não encontra card ativo.
--   3. Card ativo sem conversa nenhuma não pode existir (backfill: exclui).
-- Complementa 20260810150000 (card → terminal resolve tickets); aqui é a
-- direção inversa (conversa → card).
-- =============================================

-- ── 1) Conversa nova garante card ativo ──
CREATE OR REPLACE FUNCTION public.crm_card_on_conv_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_stage TEXT := 'Em Atendimento Humano';
    v_queue_name TEXT;
BEGIN
    IF NEW.contact_id IS NULL OR NEW.status NOT IN ('open', 'pending') THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM crm_client cc
               WHERE cc.contact_id = NEW.contact_id AND cc.is_active) THEN
        RETURN NEW;
    END IF;

    IF NEW.queue_id IS NOT NULL THEN
        SELECT q.name INTO v_queue_name FROM queues q WHERE q.id = NEW.queue_id;
        IF v_queue_name = 'Atendimento IA' THEN
            v_stage := 'Em Atendimento IA';
        END IF;
    END IF;

    -- arbiter = uq_crm_client_one_active_per_contact (parcial WHERE is_active)
    INSERT INTO crm_client (user_id, contact_id, stage)
    VALUES (NEW.user_id, NEW.contact_id, v_stage)
    ON CONFLICT (contact_id) WHERE is_active DO NOTHING;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_card_on_conv_insert_trg ON conversations;
CREATE TRIGGER crm_card_on_conv_insert_trg
    AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION public.crm_card_on_conv_insert();

-- ── 2) Conversa resolvida finaliza o card (se não sobrou conversa ativa) ──
CREATE OR REPLACE FUNCTION public.crm_card_on_conv_resolve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status <> 'resolved' OR OLD.status = 'resolved' OR NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM conversations c
               WHERE c.contact_id = NEW.contact_id
                 AND c.user_id = NEW.user_id
                 AND c.id <> NEW.id
                 AND c.status IN ('open', 'pending')) THEN
        RETURN NEW;
    END IF;

    -- crm_terminal_enforce_inactive (BEFORE) desativa; crm_terminal_resolve_tickets
    -- (AFTER) roda mas não acha conversa open/pending (checado acima) => converge.
    UPDATE crm_client cc
    SET stage = 'Finalizado', stage_changed_at = NOW(), updated_at = NOW()
    WHERE cc.contact_id = NEW.contact_id
      AND cc.user_id = NEW.user_id
      AND cc.is_active;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_card_on_conv_resolve_trg ON conversations;
CREATE TRIGGER crm_card_on_conv_resolve_trg
    AFTER UPDATE OF status ON conversations
    FOR EACH ROW EXECUTE FUNCTION public.crm_card_on_conv_resolve();

-- ── 3) Backfill (statements separados — sem CTE, pitfall dos AFTER triggers) ──

-- 3a) Card ativo sem conversa NENHUMA => excluir (history/services em CASCADE)
DELETE FROM crm_client cc
WHERE cc.is_active
  AND NOT EXISTS (SELECT 1 FROM conversations c
                  WHERE c.contact_id = cc.contact_id AND c.user_id = cc.user_id);

-- 3b) Card ativo sem conversa open/pending => Finalizado (inativo via trigger)
UPDATE crm_client cc
SET stage = 'Finalizado', stage_changed_at = NOW(), updated_at = NOW()
WHERE cc.is_active
  AND NOT EXISTS (SELECT 1 FROM conversations c
                  WHERE c.contact_id = cc.contact_id
                    AND c.user_id = cc.user_id
                    AND c.status IN ('open', 'pending'));
