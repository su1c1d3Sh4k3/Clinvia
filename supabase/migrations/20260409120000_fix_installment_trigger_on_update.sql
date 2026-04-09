-- =============================================
-- Migration: Fix installment trigger to also fire on UPDATE
-- Problem: useUpdateSale deletes installments then updates sale,
-- but trigger only fired AFTER INSERT -- installments were never regenerated.
-- =============================================

-- 1. Replace the function to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION generate_sale_installments()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_installment_num INTEGER;
    v_due_date DATE;
    v_base_amount DECIMAL(12,2);
    v_interest_amount DECIMAL(12,2);
    v_installment_amount DECIMAL(12,2);
    v_remaining DECIMAL(12,2);
BEGIN
    -- On UPDATE: skip if payment-relevant fields didn't change AND installments exist
    IF TG_OP = 'UPDATE' THEN
        IF OLD.payment_type = NEW.payment_type
           AND OLD.total_amount = NEW.total_amount
           AND OLD.installments = NEW.installments
           AND COALESCE(OLD.interest_rate, 0) = COALESCE(NEW.interest_rate, 0)
           AND COALESCE(OLD.cash_amount, 0) = COALESCE(NEW.cash_amount, 0)
           AND OLD.sale_date = NEW.sale_date
           AND EXISTS (SELECT 1 FROM sale_installments WHERE sale_id = NEW.id)
        THEN
            RETURN NEW; -- Nothing payment-related changed and installments exist, skip
        END IF;

        -- Delete old installments before regenerating
        DELETE FROM sale_installments WHERE sale_id = NEW.id;
    END IF;

    -- === Generate installments (same logic for INSERT and UPDATE) ===

    IF NEW.payment_type = 'mixed' AND NEW.installments > 0 AND COALESCE(NEW.cash_amount, 0) > 0 THEN
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
        -- PARCELADO: parcelas mensais
        v_base_amount := NEW.total_amount / NEW.installments;

        FOR v_installment_num IN 1..NEW.installments LOOP
            v_due_date := NEW.sale_date + (v_installment_num - 1) * INTERVAL '1 month';
            v_interest_amount := NEW.total_amount * (COALESCE(NEW.interest_rate, 0) / 100) * (v_installment_num - 1);
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

-- 2. Recreate trigger as AFTER INSERT OR UPDATE
DROP TRIGGER IF EXISTS trigger_generate_sale_installments ON sales;
CREATE TRIGGER trigger_generate_sale_installments
    AFTER INSERT OR UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION generate_sale_installments();

-- 3. Repair step: regenerate installments for sales that lost them
-- (due to the bug where useUpdateSale deleted installments but trigger didn't regenerate)
DO $$
DECLARE
    v_sale RECORD;
BEGIN
    FOR v_sale IN
        SELECT s.id, s.payment_type, s.total_amount, s.installments,
               s.interest_rate, s.cash_amount, s.sale_date
        FROM sales s
        LEFT JOIN sale_installments si ON si.sale_id = s.id
        WHERE si.id IS NULL
    LOOP
        -- Trigger a no-op update to regenerate installments via the trigger
        UPDATE sales SET updated_at = now() WHERE id = v_sale.id;
    END LOOP;
END;
$$;
