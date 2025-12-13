
-- =============================================
-- FIX FINANCIAL PERMISSIONS & CHARTS (V2)
-- =============================================

-- 1. Helper Function
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  -- Considera staff quem está em team_members com role admin/supervisor
  -- OU quem está na tabela profiles (dono/admin original)
  RETURN EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. DROP FUNCTIONS TO AVOID CONFLICTS
-- =============================================

DROP FUNCTION IF EXISTS get_financial_summary(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_annual_balance(INTEGER);
DROP FUNCTION IF EXISTS get_revenue_by_agent();
DROP FUNCTION IF EXISTS get_revenue_by_professional();

-- =============================================
-- 3. RECREATE FUNCTIONS (GLOBAL VIEW)
-- =============================================

-- RPC: Resumo Financeiro Mensal
CREATE OR REPLACE FUNCTION get_financial_summary(p_month INTEGER, p_year INTEGER)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Aggregate data for ALL users (Company View)
    SELECT json_build_object(
        'received', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_receivables', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'debited', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_debits', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'overdue_revenues', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE status = 'overdue'
        ), 0),
        'overdue_expenses', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE status = 'overdue'
        ), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- RPC: Balanço Anual (12 meses)
CREATE OR REPLACE FUNCTION get_annual_balance(p_year INTEGER DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_result JSON;
BEGIN
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
                WHERE EXTRACT(MONTH FROM r.due_date) = m.month_num
                AND EXTRACT(YEAR FROM r.due_date) = v_year
            ), 0)::DECIMAL as revenue,
            COALESCE((
                SELECT SUM(e.amount) 
                FROM expenses e 
                WHERE EXTRACT(MONTH FROM e.due_date) = m.month_num
                AND EXTRACT(YEAR FROM e.due_date) = v_year
            ), 0)::DECIMAL + COALESCE((
                SELECT SUM(tc.base_salary + tc.commission + tc.bonus - tc.deductions) 
                FROM team_costs tc 
                WHERE tc.reference_month = m.month_num
                AND tc.reference_year = v_year
            ), 0)::DECIMAL as expenses
        FROM generate_series(1, 12) as m(month_num)
    ) as month_data;

    RETURN v_result;
END;
$$;

-- RPC: Receita por Atendente
CREATE OR REPLACE FUNCTION get_revenue_by_agent()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(agent_data ORDER BY total_revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COUNT(DISTINCT r.id)::INTEGER as transactions
        FROM team_members tm
        LEFT JOIN revenues r ON r.team_member_id = tm.id AND r.status = 'paid'
        GROUP BY tm.id, tm.name, tm.avatar_url
    ) as agent_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- RPC: Receita por Profissional
CREATE OR REPLACE FUNCTION get_revenue_by_professional()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(professional_data ORDER BY total_revenue DESC)
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
        GROUP BY p.id, p.name, p.photo_url
    ) as professional_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- =============================================
-- 4. UPDATE RLS POLICIES
-- =============================================

-- Revenues
DROP POLICY IF EXISTS "Users can view own revenues" ON revenues;
DROP POLICY IF EXISTS "Staff can view all revenues" ON revenues;
CREATE POLICY "Staff can view all revenues" ON revenues
    FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "Users can insert own revenues" ON revenues;
DROP POLICY IF EXISTS "Staff can insert revenues" ON revenues;
CREATE POLICY "Staff can insert revenues" ON revenues
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own revenues" ON revenues;
DROP POLICY IF EXISTS "Staff can update all revenues" ON revenues;
CREATE POLICY "Staff can update all revenues" ON revenues
    FOR UPDATE USING (is_staff());

DROP POLICY IF EXISTS "Users can delete own revenues" ON revenues;
DROP POLICY IF EXISTS "Staff can delete all revenues" ON revenues;
CREATE POLICY "Staff can delete all revenues" ON revenues
    FOR DELETE USING (is_staff());

-- Expenses
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Staff can view all expenses" ON expenses;
CREATE POLICY "Staff can view all expenses" ON expenses
    FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
DROP POLICY IF EXISTS "Staff can insert expenses" ON expenses;
CREATE POLICY "Staff can insert expenses" ON expenses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Staff can update all expenses" ON expenses;
CREATE POLICY "Staff can update all expenses" ON expenses
    FOR UPDATE USING (is_staff());

DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
DROP POLICY IF EXISTS "Staff can delete all expenses" ON expenses;
CREATE POLICY "Staff can delete all expenses" ON expenses
    FOR DELETE USING (is_staff());

-- Team Costs
DROP POLICY IF EXISTS "Users can view own team costs" ON team_costs;
DROP POLICY IF EXISTS "Staff can view all team costs" ON team_costs;
CREATE POLICY "Staff can view all team costs" ON team_costs
    FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "Users can insert own team costs" ON team_costs;
DROP POLICY IF EXISTS "Staff can insert team costs" ON team_costs;
CREATE POLICY "Staff can insert team costs" ON team_costs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own team costs" ON team_costs;
DROP POLICY IF EXISTS "Staff can update all team costs" ON team_costs;
CREATE POLICY "Staff can update all team costs" ON team_costs
    FOR UPDATE USING (is_staff());

DROP POLICY IF EXISTS "Users can delete own team costs" ON team_costs;
DROP POLICY IF EXISTS "Staff can delete all team costs" ON team_costs;
CREATE POLICY "Staff can delete all team costs" ON team_costs
    FOR DELETE USING (is_staff());

-- Marketing Campaigns
DROP POLICY IF EXISTS "Users can view own marketing campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Staff can view all marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Staff can view all marketing campaigns" ON marketing_campaigns
    FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "Users can insert own marketing campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Staff can insert marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Staff can insert marketing campaigns" ON marketing_campaigns
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own marketing campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Staff can update all marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Staff can update all marketing campaigns" ON marketing_campaigns
    FOR UPDATE USING (is_staff());

DROP POLICY IF EXISTS "Users can delete own marketing campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Staff can delete all marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Staff can delete all marketing campaigns" ON marketing_campaigns
    FOR DELETE USING (is_staff());
