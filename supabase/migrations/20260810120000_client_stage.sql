-- =============================================
-- Categorização automática de clientes: contato / lead / cliente
-- Regras (baseadas em vendas com service_client_id — vendas legadas sem vínculo são ignoradas):
--   - venda em categoria != Avaliação  -> 'cliente'
--   - apenas vendas em categoria Avaliação -> 'lead'
--   - nenhuma venda -> 'contato'
-- Satélites IG (linked_contact_id) herdam o stage do contato mestre.
-- =============================================

-- 1. Coluna
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_stage text NOT NULL DEFAULT 'contato';

DO $$ BEGIN
    ALTER TABLE contacts ADD CONSTRAINT contacts_client_stage_check
        CHECK (client_stage IN ('contato', 'lead', 'cliente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Normalização de texto (accent-insensitive, sem depender da extensão unaccent)
CREATE OR REPLACE FUNCTION clinvia_normalize_txt(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT lower(translate(coalesce(p, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

-- 3. Cálculo do stage de um contato
CREATE OR REPLACE FUNCTION compute_contact_client_stage(p_contact_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_has_other boolean;
    v_has_aval boolean;
BEGIN
    SELECT
        bool_or(clinvia_normalize_txt(cat.name) <> 'avaliacao'),
        bool_or(clinvia_normalize_txt(cat.name) = 'avaliacao')
    INTO v_has_other, v_has_aval
    FROM sales s
    JOIN services_client sc ON sc.id = s.service_client_id
    LEFT JOIN services_category cat ON cat.id = sc.category_id
    WHERE s.contact_id = p_contact_id;

    RETURN CASE
        WHEN coalesce(v_has_other, false) THEN 'cliente'
        WHEN coalesce(v_has_aval, false) THEN 'lead'
        ELSE 'contato'
    END;
END $$;

-- 4. Recalcula e grava (contato + satélites IG vinculados)
CREATE OR REPLACE FUNCTION recalc_contact_client_stage(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_stage text;
BEGIN
    IF p_contact_id IS NULL THEN RETURN; END IF;
    v_stage := compute_contact_client_stage(p_contact_id);
    UPDATE contacts
    SET client_stage = v_stage
    WHERE (id = p_contact_id OR linked_contact_id = p_contact_id)
      AND client_stage IS DISTINCT FROM v_stage;
END $$;

-- 5. Trigger em sales
CREATE OR REPLACE FUNCTION trg_sales_recalc_client_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recalc_contact_client_stage(OLD.contact_id);
        RETURN OLD;
    END IF;
    PERFORM recalc_contact_client_stage(NEW.contact_id);
    IF TG_OP = 'UPDATE' AND OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
        PERFORM recalc_contact_client_stage(OLD.contact_id);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_recalc_client_stage ON sales;
CREATE TRIGGER sales_recalc_client_stage
    AFTER INSERT OR DELETE OR UPDATE OF contact_id, service_client_id ON sales
    FOR EACH ROW EXECUTE FUNCTION trg_sales_recalc_client_stage();

-- 6. Vínculo/desvínculo IG: satélite herda stage do mestre (ou recalcula o próprio ao desvincular)
CREATE OR REPLACE FUNCTION trg_contact_link_copy_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.linked_contact_id IS NOT NULL THEN
        SELECT client_stage INTO NEW.client_stage FROM contacts WHERE id = NEW.linked_contact_id;
        NEW.client_stage := coalesce(NEW.client_stage, 'contato');
    ELSE
        NEW.client_stage := compute_contact_client_stage(NEW.id);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contact_link_copy_stage ON contacts;
CREATE TRIGGER contact_link_copy_stage
    BEFORE UPDATE OF linked_contact_id ON contacts
    FOR EACH ROW
    WHEN (OLD.linked_contact_id IS DISTINCT FROM NEW.linked_contact_id)
    EXECUTE FUNCTION trg_contact_link_copy_stage();

-- 7. Proteção da categoria Avaliação (não pode ser renomeada nem excluída)
CREATE OR REPLACE FUNCTION protect_avaliacao_category()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF clinvia_normalize_txt(OLD.name) = 'avaliacao' THEN
            RAISE EXCEPTION 'A categoria Avaliação não pode ser excluída';
        END IF;
        RETURN OLD;
    END IF;
    IF clinvia_normalize_txt(OLD.name) = 'avaliacao'
       AND clinvia_normalize_txt(NEW.name) <> 'avaliacao' THEN
        RAISE EXCEPTION 'A categoria Avaliação não pode ser renomeada';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS services_category_protect_avaliacao ON services_category;
CREATE TRIGGER services_category_protect_avaliacao
    BEFORE UPDATE OF name OR DELETE ON services_category
    FOR EACH ROW EXECUTE FUNCTION protect_avaliacao_category();

-- 8. Backfill: contatos com vendas vinculadas
WITH agg AS (
    SELECT s.contact_id,
        bool_or(clinvia_normalize_txt(cat.name) <> 'avaliacao') AS has_other,
        bool_or(clinvia_normalize_txt(cat.name) = 'avaliacao') AS has_aval
    FROM sales s
    JOIN services_client sc ON sc.id = s.service_client_id
    LEFT JOIN services_category cat ON cat.id = sc.category_id
    WHERE s.contact_id IS NOT NULL
    GROUP BY s.contact_id
)
UPDATE contacts c
SET client_stage = CASE WHEN a.has_other THEN 'cliente' WHEN a.has_aval THEN 'lead' ELSE 'contato' END
FROM agg a
WHERE a.contact_id = c.id;

-- 9. Backfill: satélites IG herdam do mestre
UPDATE contacts sat
SET client_stage = m.client_stage
FROM contacts m
WHERE sat.linked_contact_id = m.id
  AND sat.client_stage IS DISTINCT FROM m.client_stage;
