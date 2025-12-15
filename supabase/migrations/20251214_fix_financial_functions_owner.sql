-- =============================================
-- FIX: Funções RPC de financeiro filtradas por owner
-- Data: 2025-12-14 21:20
-- =============================================

-- 1. CORRIGIR get_revenue_by_agent() - filtrar por user_id do owner
DROP FUNCTION IF EXISTS get_revenue_by_agent();

CREATE OR REPLACE FUNCTION get_revenue_by_agent()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
    v_result JSON;
BEGIN
    -- Obter o user_id do owner
    v_owner_id := get_owner_id();
    
    -- Mostrar apenas team_members do mesmo owner
    SELECT json_agg(agent_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(tm.commission, 0)::DECIMAL as "commissionRate",
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COALESCE(SUM(r.amount) * COALESCE(tm.commission, 0) / 100, 0)::DECIMAL as "commissionTotal",
            COUNT(DISTINCT r.id)::INTEGER as transactions
        FROM public.team_members tm
        LEFT JOIN public.revenues r ON r.team_member_id = tm.id AND r.status = 'paid'
        WHERE tm.user_id = v_owner_id  -- FILTRO POR OWNER
        GROUP BY tm.id, tm.name, tm.avatar_url, tm.commission
    ) as agent_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- 2. CORRIGIR get_revenue_by_professional() - filtrar por owner
DROP FUNCTION IF EXISTS get_revenue_by_professional();

CREATE OR REPLACE FUNCTION get_revenue_by_professional()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
    v_result JSON;
BEGIN
    v_owner_id := get_owner_id();
    
    SELECT json_agg(professional_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            p.id,
            p.name,
            p.photo_url as photo,
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COUNT(DISTINCT r.appointment_id)::INTEGER as appointments
        FROM professionals p
        LEFT JOIN revenues r ON r.professional_id = p.id AND r.status = 'paid'
        WHERE p.user_id = v_owner_id  -- FILTRO POR OWNER
        GROUP BY p.id, p.name, p.photo_url
    ) as professional_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- 3. CORRIGIR get_financial_summary() - filtrar por owner
DROP FUNCTION IF EXISTS get_financial_summary(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_financial_summary(p_month INTEGER, p_year INTEGER)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_owner_id := get_owner_id();
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT json_build_object(
        'received', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_owner_id AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_receivables', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_owner_id AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'debited', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_owner_id AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE user_id = v_owner_id AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_debits', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_owner_id AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE user_id = v_owner_id AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'overdue_revenues', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_owner_id AND status = 'overdue'
        ), 0),
        'overdue_expenses', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_owner_id AND status = 'overdue'
        ), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. CORRIGIR get_annual_balance() - filtrar por owner
DROP FUNCTION IF EXISTS get_annual_balance(INTEGER);

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
            ), 0)::DECIMAL as revenues,
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
