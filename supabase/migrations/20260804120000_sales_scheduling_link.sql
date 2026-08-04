-- =============================================================
-- Vendas x Agendamentos (2026-08-04)
-- Regra nova: agendamento criado => venda criada/vinculada.
-- Conclusão de agendamento NÃO gera mais venda (removido no app).
-- =============================================================

-- 1. Novas colunas em sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS service_client_id UUID REFERENCES services_client(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS scheduled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ia_scheduling BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ia_contact_days INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ia_scheduling_status TEXT
    CHECK (ia_scheduling_status IN ('pendente', 'vencido', 'contato_realizado', 'agendado'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS appointment_alert TEXT
    CHECK (appointment_alert IN ('canceled', 'no_show'));

CREATE INDEX IF NOT EXISTS idx_sales_appointment ON sales(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sales_service_client ON sales(service_client_id);
CREATE INDEX IF NOT EXISTS idx_sales_ia_scheduling_due
    ON sales(user_id, created_at)
    WHERE ia_scheduling AND ia_scheduling_status IN ('pendente', 'vencido');

COMMENT ON COLUMN sales.ia_contact_days IS 'Dias após a venda para a IA contatar o cliente e agendar o serviço (sem relação com recorrência)';
COMMENT ON COLUMN sales.appointment_alert IS 'Alerta visual: agendamento vinculado foi cancelado ou cliente não compareceu (venda não é alterada automaticamente)';

-- 2. Novas colunas em crm_client_services (flags configuradas na negociação, copiadas para a venda no Ganho)
ALTER TABLE crm_client_services ADD COLUMN IF NOT EXISTS scheduled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_client_services ADD COLUMN IF NOT EXISTS ia_scheduling BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_client_services ADD COLUMN IF NOT EXISTS ia_contact_days INTEGER;

-- 3. Trigger: agendamento criado => vincula venda pendente do mesmo contato+serviço, senão cria venda (pagamento pendente)
CREATE OR REPLACE FUNCTION link_or_create_sale_on_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Venda pendente (sem agendamento) mais antiga do mesmo contato + serviço
    SELECT id INTO v_sale_id
    FROM sales
    WHERE user_id = NEW.user_id
      AND contact_id = NEW.contact_id
      AND service_client_id = NEW.service_id
      AND appointment_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_sale_id IS NOT NULL THEN
        UPDATE sales
        SET appointment_id = NEW.id,
            scheduled = true,
            appointment_alert = v_alert,
            ia_scheduling_status = CASE WHEN ia_scheduling THEN 'agendado' ELSE ia_scheduling_status END,
            updated_at = now()
        WHERE id = v_sale_id;
    ELSE
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
$$;

DROP TRIGGER IF EXISTS trg_link_or_create_sale_on_appointment ON appointments;
CREATE TRIGGER trg_link_or_create_sale_on_appointment
    AFTER INSERT ON appointments
    FOR EACH ROW EXECUTE FUNCTION link_or_create_sale_on_appointment();

-- 4. Trigger: cancelamento / não comparecimento => apenas alerta na venda (nunca altera valores)
CREATE OR REPLACE FUNCTION flag_sale_on_appointment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        UPDATE sales
        SET appointment_alert = CASE NEW.status
                WHEN 'canceled' THEN 'canceled'
                WHEN 'no-show' THEN 'no_show'
                ELSE NULL
            END,
            updated_at = now()
        WHERE appointment_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_sale_on_appointment_status ON appointments;
CREATE TRIGGER trg_flag_sale_on_appointment_status
    AFTER UPDATE OF status ON appointments
    FOR EACH ROW EXECUTE FUNCTION flag_sale_on_appointment_status();

-- 5. Regeneração de parcelas quando o pagamento muda já é coberta por
--    trigger_generate_sale_installments (AFTER INSERT OR UPDATE, migration 20260409120000).

-- 6. Função para o cron/API marcar vendas IA vencidas
CREATE OR REPLACE FUNCTION update_overdue_ia_scheduling()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE sales
    SET ia_scheduling_status = 'vencido', updated_at = now()
    WHERE ia_scheduling
      AND ia_scheduling_status = 'pendente'
      AND ia_contact_days IS NOT NULL
      AND sale_date + ia_contact_days * INTERVAL '1 day' <= CURRENT_DATE;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;
