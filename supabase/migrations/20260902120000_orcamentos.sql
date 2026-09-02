-- =============================================================================
-- ORCAMENTOS
-- Etapa anterior a venda: o atendente monta o orcamento (servicos + profissional
-- responsavel + indicacao + validade) e depois "lanca a venda" a partir dele.
-- Cada UNIDADE vendida e uma linha propria (orcamento_itens) com status proprio.
-- =============================================================================

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orcamentos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    contact_id      uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    responsavel_id  uuid NOT NULL REFERENCES public.responsaveis(id) ON DELETE RESTRICT,
    indicacao       text,
    validade        date,
    notes           text,
    created_by      uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,
    orcamento_id       uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
    service_client_id  uuid REFERENCES public.services_client(id) ON DELETE SET NULL,
    service_name       text NOT NULL,
    unit_price         numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    min_price          numeric,
    status             text NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','vendido','recusado','expirado')),
    sale_id            uuid REFERENCES public.sales(id) ON DELETE SET NULL,
    decided_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_user_contact ON public.orcamentos(user_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_validade     ON public.orcamentos(validade) WHERE validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orc_itens_orcamento     ON public.orcamento_itens(orcamento_id, status);
CREATE INDEX IF NOT EXISTS idx_orc_itens_sale          ON public.orcamento_itens(sale_id) WHERE sale_id IS NOT NULL;

-- ─── 2. Colunas novas em sales ───────────────────────────────────────────────

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS orcamento_item_id uuid REFERENCES public.orcamento_itens(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsavel_id    uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orcamento_item
    ON public.sales(orcamento_item_id) WHERE orcamento_item_id IS NOT NULL;

COMMENT ON COLUMN public.sales.responsavel_id IS 'Profissional humano (responsaveis). professional_id continua sendo a SALA.';

-- ─── 3. Vinculo deterministico venda <-> agendamento ─────────────────────────
-- appointments.expected_sale_id: quando preenchido, o trigger vincula EXATAMENTE
-- essa venda em vez de adivinhar "a mais antiga sem agendamento".

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS expected_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.link_or_create_sale_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sale_id UUID;
    v_name TEXT;
    v_price NUMERIC;
    v_alert TEXT;
BEGIN
    -- Só agendamentos reais, com contato e serviço definidos (GCal/eventos pessoais ficam de fora)
    IF NEW.type IS DISTINCT FROM 'appointment' OR NEW.contact_id IS NULL OR NEW.service_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_alert := CASE NEW.status WHEN 'canceled' THEN 'canceled' WHEN 'no-show' THEN 'no_show' ELSE NULL END;

    IF NEW.expected_sale_id IS NOT NULL THEN
        -- Vínculo explícito (wizard de lançamento de venda a partir do orçamento)
        SELECT id INTO v_sale_id
        FROM sales
        WHERE id = NEW.expected_sale_id
          AND user_id = NEW.user_id
          AND appointment_id IS NULL;
    ELSE
        -- Venda pendente (sem agendamento) mais antiga do mesmo contato + serviço
        SELECT id INTO v_sale_id
        FROM sales
        WHERE user_id = NEW.user_id
          AND contact_id = NEW.contact_id
          AND service_client_id = NEW.service_id
          AND appointment_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_sale_id IS NOT NULL THEN
        UPDATE sales
        SET appointment_id = NEW.id,
            scheduled = true,
            appointment_alert = v_alert,
            ia_scheduling_status = CASE WHEN ia_scheduling THEN 'agendado' ELSE ia_scheduling_status END,
            updated_at = now()
        WHERE id = v_sale_id;
    ELSIF NEW.expected_sale_id IS NULL THEN
        SELECT name, price INTO v_name, v_price FROM services_client WHERE id = NEW.service_id;

        INSERT INTO sales (
            user_id, category, product_service_id, service_client_id, product_name,
            quantity, unit_price, total_amount,
            payment_type, installments,
            sale_date, contact_id, professional_id,
            appointment_id, scheduled, appointment_alert
        ) VALUES (
            NEW.user_id, 'service', NULL, NEW.service_id,
            COALESCE(v_name, NEW.service_name, 'Serviço'),
            1, COALESCE(NULLIF(NEW.price, 0), v_price, 0), COALESCE(NULLIF(NEW.price, 0), v_price, 0),
            'pending', 1,
            CURRENT_DATE, NEW.contact_id, NEW.professional_id,
            NEW.id, true, v_alert
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- ─── 4. Triggers de integridade dos orçamentos ───────────────────────────────

CREATE OR REPLACE FUNCTION public.orcamento_item_fill_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        SELECT user_id INTO NEW.user_id FROM orcamentos WHERE id = NEW.orcamento_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_item_fill ON public.orcamento_itens;
CREATE TRIGGER trg_orcamento_item_fill
BEFORE INSERT ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.orcamento_item_fill_defaults();

-- Avaliação nunca entra em orçamento (é só agendada; a venda nasce do agendamento)
CREATE OR REPLACE FUNCTION public.guard_orcamento_item_avaliacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cat text;
BEGIN
    IF NEW.service_client_id IS NULL THEN RETURN NEW; END IF;

    SELECT cat.name INTO v_cat
    FROM services_client sc
    JOIN services_category cat ON cat.id = sc.category_id
    WHERE sc.id = NEW.service_client_id;

    IF v_cat IS NOT NULL AND clinvia_normalize_txt(v_cat) = 'avaliacao' THEN
        RAISE EXCEPTION 'Serviços da categoria Avaliação não entram em orçamento — agende a avaliação direto pela agenda.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orc_item_avaliacao ON public.orcamento_itens;
CREATE TRIGGER trg_guard_orc_item_avaliacao
BEFORE INSERT ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.guard_orcamento_item_avaliacao();

-- Item já decidido (vendido/recusado/expirado) não pode ter serviço/valor alterados
CREATE OR REPLACE FUNCTION public.guard_orcamento_item_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF OLD.status <> 'pendente'
       AND (NEW.service_client_id IS DISTINCT FROM OLD.service_client_id
            OR NEW.unit_price IS DISTINCT FROM OLD.unit_price) THEN
        RAISE EXCEPTION 'Este item já foi decidido e não pode mais ser alterado.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'vendido' AND NEW.sale_id IS NULL THEN
        RAISE EXCEPTION 'Item vendido precisa estar vinculado a uma venda.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pendente' THEN
        NEW.decided_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orc_item_edit ON public.orcamento_itens;
CREATE TRIGGER trg_guard_orc_item_edit
BEFORE UPDATE ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.guard_orcamento_item_edit();

-- Orçamento com qualquer item já decidido não pode ser excluído
CREATE OR REPLACE FUNCTION public.guard_orcamento_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM orcamento_itens WHERE orcamento_id = OLD.id AND status <> 'pendente') THEN
        RAISE EXCEPTION 'Este orçamento já tem serviços vendidos ou recusados e não pode ser excluído.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orcamento_delete ON public.orcamentos;
CREATE TRIGGER trg_guard_orcamento_delete
BEFORE DELETE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.guard_orcamento_delete();

DROP TRIGGER IF EXISTS update_orcamentos_updated_at ON public.orcamentos;
CREATE TRIGGER update_orcamentos_updated_at
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_orcamento_itens_updated_at ON public.orcamento_itens;
CREATE TRIGGER update_orcamento_itens_updated_at
BEFORE UPDATE ON public.orcamento_itens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.orcamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orcamentos_select ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_insert ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_update ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_delete ON public.orcamentos;

CREATE POLICY orcamentos_select ON public.orcamentos FOR SELECT
    USING (user_id = (SELECT public.get_owner_id()));
CREATE POLICY orcamentos_insert ON public.orcamentos FOR INSERT
    WITH CHECK (user_id = (SELECT public.get_owner_id()));
CREATE POLICY orcamentos_update ON public.orcamentos FOR UPDATE
    USING (user_id = (SELECT public.get_owner_id()))
    WITH CHECK (user_id = (SELECT public.get_owner_id()));
CREATE POLICY orcamentos_delete ON public.orcamentos FOR DELETE
    USING (user_id = (SELECT public.get_owner_id()));

DROP POLICY IF EXISTS orcamento_itens_select ON public.orcamento_itens;
DROP POLICY IF EXISTS orcamento_itens_insert ON public.orcamento_itens;
DROP POLICY IF EXISTS orcamento_itens_update ON public.orcamento_itens;
DROP POLICY IF EXISTS orcamento_itens_delete ON public.orcamento_itens;

CREATE POLICY orcamento_itens_select ON public.orcamento_itens FOR SELECT
    USING (user_id = (SELECT public.get_owner_id()));
CREATE POLICY orcamento_itens_insert ON public.orcamento_itens FOR INSERT
    WITH CHECK (user_id = (SELECT public.get_owner_id()) OR user_id IS NULL);
CREATE POLICY orcamento_itens_update ON public.orcamento_itens FOR UPDATE
    USING (user_id = (SELECT public.get_owner_id()))
    WITH CHECK (user_id = (SELECT public.get_owner_id()));
CREATE POLICY orcamento_itens_delete ON public.orcamento_itens FOR DELETE
    USING (user_id = (SELECT public.get_owner_id()));

-- ─── 6. Autocomplete de indicações ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_orcamento_indicacoes(p_q text DEFAULT NULL)
RETURNS TABLE(indicacao text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT o.indicacao, count(*)::bigint
    FROM orcamentos o
    WHERE o.user_id = public.get_owner_id()
      AND o.indicacao IS NOT NULL
      AND btrim(o.indicacao) <> ''
      AND (p_q IS NULL OR btrim(p_q) = ''
           OR clinvia_normalize_txt(o.indicacao) LIKE '%' || clinvia_normalize_txt(p_q) || '%')
    GROUP BY o.indicacao
    ORDER BY count(*) DESC, o.indicacao ASC
    LIMIT 10;
$$;

-- ─── 7. Valor movimentado do contato ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_contact_valor_movimentado(p_contact_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(SUM(s.total_amount), 0)
    FROM sales s
    WHERE s.contact_id = p_contact_id
      AND s.user_id = public.get_owner_id();
$$;

-- ─── 8. Lançamento de venda a partir do orçamento ────────────────────────────
-- p_itens: [{ item_id, unit_price, professional_id, payment_type, installments,
--             interest_rate, cash_amount, sale_date, notes,
--             ia_scheduling, ia_contact_days }]

CREATE OR REPLACE FUNCTION public.lancar_venda_do_orcamento(
    p_orcamento_id uuid,
    p_itens jsonb,
    p_recusados uuid[] DEFAULT '{}'::uuid[],
    p_team_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_owner uuid := public.get_owner_id();
    v_contact uuid;
    v_responsavel uuid;
    v_it jsonb;
    v_item public.orcamento_itens%ROWTYPE;
    v_sale_id uuid;
    v_price numeric;
    v_ia boolean;
    v_result jsonb := '[]'::jsonb;
BEGIN
    SELECT contact_id, responsavel_id INTO v_contact, v_responsavel
    FROM orcamentos WHERE id = p_orcamento_id AND user_id = v_owner;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE = 'check_violation';
    END IF;

    FOR v_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb))
    LOOP
        SELECT * INTO v_item FROM orcamento_itens
        WHERE id = (v_it->>'item_id')::uuid
          AND orcamento_id = p_orcamento_id
          AND user_id = v_owner
        FOR UPDATE;

        IF v_item.id IS NULL THEN
            RAISE EXCEPTION 'Item do orçamento não encontrado.' USING ERRCODE = 'check_violation';
        END IF;
        IF v_item.status <> 'pendente' THEN
            RAISE EXCEPTION 'O serviço "%" já foi decidido neste orçamento.', v_item.service_name
                USING ERRCODE = 'check_violation';
        END IF;

        v_price := COALESCE((v_it->>'unit_price')::numeric, v_item.unit_price, 0);
        v_ia := COALESCE((v_it->>'ia_scheduling')::boolean, false);

        INSERT INTO sales (
            user_id, category, service_client_id, product_name,
            quantity, unit_price, total_amount,
            payment_type, installments, interest_rate, cash_amount,
            sale_date, contact_id, team_member_id, professional_id, responsavel_id,
            notes, orcamento_item_id,
            scheduled, ia_scheduling, ia_contact_days, ia_scheduling_status
        ) VALUES (
            v_owner, 'service', v_item.service_client_id, v_item.service_name,
            1, v_price, v_price,
            COALESCE(v_it->>'payment_type', 'pending'),
            GREATEST(1, LEAST(24, COALESCE((v_it->>'installments')::int, 1))),
            COALESCE((v_it->>'interest_rate')::numeric, 0),
            NULLIF(v_it->>'cash_amount', '')::numeric,
            COALESCE((v_it->>'sale_date')::date, CURRENT_DATE),
            v_contact, p_team_member_id,
            NULLIF(v_it->>'professional_id', '')::uuid, v_responsavel,
            NULLIF(v_it->>'notes', ''), v_item.id,
            false, v_ia,
            CASE WHEN v_ia THEN COALESCE((v_it->>'ia_contact_days')::int, 0) ELSE NULL END,
            CASE WHEN v_ia THEN 'pendente' ELSE NULL END
        )
        RETURNING id INTO v_sale_id;

        UPDATE orcamento_itens
        SET status = 'vendido', sale_id = v_sale_id, unit_price = v_price
        WHERE id = v_item.id;

        v_result := v_result || jsonb_build_object(
            'item_id', v_item.id,
            'sale_id', v_sale_id,
            'service_client_id', v_item.service_client_id,
            'service_name', v_item.service_name
        );
    END LOOP;

    IF p_recusados IS NOT NULL AND array_length(p_recusados, 1) > 0 THEN
        UPDATE orcamento_itens
        SET status = 'recusado'
        WHERE id = ANY(p_recusados)
          AND orcamento_id = p_orcamento_id
          AND user_id = v_owner
          AND status = 'pendente';
    END IF;

    RETURN v_result;
END;
$$;

-- ─── 9. Expiração automática ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_orcamentos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
    UPDATE orcamento_itens i
    SET status = 'expirado'
    FROM orcamentos o
    WHERE o.id = i.orcamento_id
      AND i.status = 'pendente'
      AND o.validade IS NOT NULL
      AND o.validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

DO $$
BEGIN
    PERFORM cron.unschedule('expire-orcamentos');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('expire-orcamentos', '10 3 * * *', $$SELECT public.expire_orcamentos();$$);

-- ─── 10. Grants ──────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_orcamento_indicacoes(text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_valor_movimentado(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lancar_venda_do_orcamento(uuid, jsonb, uuid[], uuid) TO authenticated;
