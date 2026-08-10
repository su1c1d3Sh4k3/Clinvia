-- =============================================
-- Sem Contato e Sem Interesse viram etapas TERMINAIS do CRM.
-- Terminais agora: Ganho, Perdido, Sem Contato, Sem Interesse, Finalizado.
-- Regra nova (user): mover card para QUALQUER etapa terminal encerra o(s)
-- ticket(s) aberto(s)/pendente(s) do contato. Se o cliente responder depois,
-- nova conversa + novo card são criados (fluxo inbound existente).
-- =============================================

-- 1. Enforce no banco: etapa terminal => card inativo (qualquer caminho:
--    kanban, modal do inbox, api-crm/n8n, imports)
CREATE OR REPLACE FUNCTION crm_terminal_enforce_inactive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado') THEN
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_terminal_enforce_inactive_trg ON crm_client;
CREATE TRIGGER crm_terminal_enforce_inactive_trg
    BEFORE INSERT OR UPDATE OF stage ON crm_client
    FOR EACH ROW EXECUTE FUNCTION crm_terminal_enforce_inactive();

-- 2. Transição para etapa terminal => resolve conversas open/pending do contato.
--    Seguro contra bounce: o card já está inativo (trigger 1), então
--    sync_crm_stage_from_queue (só roda se queue_id mudar) e
--    sync_queue_from_crm_stage (só roda p/ card ativo) não reagem.
CREATE OR REPLACE FUNCTION crm_terminal_resolve_tickets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')
       AND (TG_OP = 'INSERT' OR OLD.stage NOT IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')) THEN
        UPDATE conversations c
        SET status = 'resolved'
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('open', 'pending');
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_terminal_resolve_tickets_trg ON crm_client;
CREATE TRIGGER crm_terminal_resolve_tickets_trg
    AFTER INSERT OR UPDATE OF stage ON crm_client
    FOR EACH ROW EXECUTE FUNCTION crm_terminal_resolve_tickets();

-- 3. Backfill: cards ATIVOS em Sem Contato/Sem Interesse viram histórico
--    e seus tickets abertos/pendentes são resolvidos.
--    (statements separados — sem CTE, para os AFTER triggers dispararem na ordem certa)
CREATE TEMP TABLE _term_backfill AS
SELECT DISTINCT contact_id, user_id
FROM crm_client
WHERE is_active = TRUE AND stage IN ('Sem Contato', 'Sem Interesse') AND contact_id IS NOT NULL;

-- Desativa primeiro (OLD.stage já é terminal => trigger 2 não dispara aqui)
UPDATE crm_client
SET is_active = false, updated_at = NOW()
WHERE is_active = TRUE AND stage IN ('Sem Contato', 'Sem Interesse');

-- Resolve os tickets (cards já inativos => sync fila<->etapa não reage)
UPDATE conversations c
SET status = 'resolved'
FROM _term_backfill t
WHERE c.contact_id = t.contact_id
  AND c.user_id = t.user_id
  AND c.status IN ('open', 'pending');

DROP TABLE _term_backfill;
