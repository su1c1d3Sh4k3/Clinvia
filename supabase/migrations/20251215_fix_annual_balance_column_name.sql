-- =====================================================
-- Fix get_annual_balance() - campo 'revenue' ao invés de 'revenues'
-- =====================================================
-- O frontend espera 'revenue' (singular) mas a função retornava 'revenues' (plural)
-- =====================================================

CREATE OR REPLACE FUNCTION get_annual_balance(p_year INTEGER DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
    v_year INTEGER;
    v_result JSON;
BEGIN
    v_owner_id := get_owner_id();
    v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

    SELECT json_agg(month_data ORDER BY month_num)
    INTO v_result
    FROM (
        SELECT 
            m.month_num,
            to_char(make_date(v_year, m.month_num, 1), 'Mon') as month,
            COALESCE((
                SELECT SUM(r.amount) 
                FROM revenues r 
                WHERE r.user_id = v_owner_id
                AND EXTRACT(MONTH FROM r.due_date) = m.month_num
                AND EXTRACT(YEAR FROM r.due_date) = v_year
            ), 0)::DECIMAL as revenue,  -- CORRIGIDO: 'revenue' ao invés de 'revenues'
            COALESCE((
                SELECT SUM(e.amount) 
                FROM expenses e 
                WHERE e.user_id = v_owner_id
                AND EXTRACT(MONTH FROM e.due_date) = m.month_num
                AND EXTRACT(YEAR FROM e.due_date) = v_year
            ), 0)::DECIMAL + COALESCE((
                SELECT SUM(tc.base_salary + tc.commission + tc.bonus - tc.deductions) 
                FROM team_costs tc 
                WHERE tc.user_id = v_owner_id
                AND tc.reference_month = m.month_num
                AND tc.reference_year = v_year
            ), 0)::DECIMAL as expenses
        FROM generate_series(1, 12) as m(month_num)
    ) as month_data;

    RETURN v_result;
END;
$$;
