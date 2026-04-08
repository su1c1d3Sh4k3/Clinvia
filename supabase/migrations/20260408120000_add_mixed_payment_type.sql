-- =============================================
-- Migration: Add 'mixed' payment type to sales
-- Allows part cash (a vista) + part installment (parcelado)
-- =============================================

-- 1. Add cash_amount column to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_amount DECIMAL(12,2) DEFAULT 0 CHECK (cash_amount >= 0);

-- 2. Drop old CHECK constraint on payment_type and add new one with 'mixed'
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_type_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_type_check
  CHECK (payment_type IN ('cash', 'installment', 'pending', 'mixed'));

-- 3. Replace the installment generation trigger to handle 'mixed' type
CREATE OR REPLACE FUNCTION generate_sale_installments()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_num INTEGER;
    v_due_date DATE;
    v_base_amount DECIMAL(12,2);
    v_interest_amount DECIMAL(12,2);
    v_installment_amount DECIMAL(12,2);
    v_remaining DECIMAL(12,2);
BEGIN
    IF NEW.payment_type = 'mixed' AND NEW.installments > 0 AND NEW.cash_amount > 0 THEN
        -- MIXED: parte a vista + parte parcelada

        -- Parcela #1: pagamento a vista (ja pago)
        INSERT INTO sale_installments (
            sale_id, installment_number, due_date, amount, status, paid_date
        ) VALUES (
            NEW.id, 1, NEW.sale_date, NEW.cash_amount, 'paid', NEW.sale_date
        );

        -- Valor restante para parcelar
        v_remaining := NEW.total_amount - NEW.cash_amount;

        IF v_remaining > 0 AND NEW.installments > 0 THEN
            v_base_amount := v_remaining / NEW.installments;

            FOR v_installment_num IN 1..NEW.installments LOOP
                v_due_date := NEW.sale_date + v_installment_num * INTERVAL '1 month';

                -- Juros simples: juros = principal * taxa * tempo_meses
                v_interest_amount := v_remaining * (COALESCE(NEW.interest_rate, 0) / 100) * v_installment_num;
                v_installment_amount := v_base_amount + (v_interest_amount / NEW.installments);

                INSERT INTO sale_installments (
                    sale_id, installment_number, due_date, amount, status
                ) VALUES (
                    NEW.id,
                    v_installment_num + 1,  -- +1 porque parcela 1 e o a vista
                    v_due_date,
                    ROUND(v_installment_amount, 2),
                    CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END
                );
            END LOOP;
        END IF;

    ELSIF NEW.payment_type = 'installment' AND NEW.installments > 1 THEN
        -- PARCELADO: igual ao original
        v_base_amount := NEW.total_amount / NEW.installments;

        FOR v_installment_num IN 1..NEW.installments LOOP
            v_due_date := NEW.sale_date + (v_installment_num - 1) * INTERVAL '1 month';
            v_interest_amount := NEW.total_amount * (NEW.interest_rate / 100) * (v_installment_num - 1);
            v_installment_amount := v_base_amount + (v_interest_amount / NEW.installments);

            INSERT INTO sale_installments (
                sale_id, installment_number, due_date, amount, status
            ) VALUES (
                NEW.id,
                v_installment_num,
                v_due_date,
                ROUND(v_installment_amount, 2),
                CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END
            );
        END LOOP;
    ELSE
        -- A VISTA ou PENDENTE: parcela unica
        INSERT INTO sale_installments (
            sale_id, installment_number, due_date, amount, status
        ) VALUES (
            NEW.id,
            1,
            NEW.sale_date,
            NEW.total_amount,
            CASE
                WHEN NEW.payment_type = 'cash' THEN 'paid'
                ELSE 'pending'
            END
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_generate_sale_installments ON sales;
CREATE TRIGGER trigger_generate_sale_installments
    AFTER INSERT ON sales
    FOR EACH ROW EXECUTE FUNCTION generate_sale_installments();
