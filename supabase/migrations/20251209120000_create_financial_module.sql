-- =============================================
-- MÓDULO FINANCEIRO - Migration Completa
-- =============================================

-- =============================================
-- 1. ENUMS
-- =============================================

-- Método de pagamento
DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM (
        'pix',
        'credit_card',
        'debit_card',
        'bank_transfer',
        'cash',
        'boleto',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Status financeiro
DO $$ BEGIN
    CREATE TYPE financial_status AS ENUM (
        'paid',
        'pending',
        'overdue',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Período de recorrência
DO $$ BEGIN
    CREATE TYPE recurrence_period AS ENUM (
        'weekly',
        'monthly',
        'yearly'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tipo de colaborador
DO $$ BEGIN
    CREATE TYPE collaborator_type AS ENUM (
        'agent',
        'supervisor',
        'professional'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Origem de marketing
DO $$ BEGIN
    CREATE TYPE marketing_origin AS ENUM (
        'google',
        'meta',
        'tiktok',
        'linkedin',
        'twitter',
        'email',
        'organic',
        'referral',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Status de campanha
DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM (
        'active',
        'paused',
        'finished'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 2. TABELAS DE CATEGORIAS
-- =============================================

-- Categorias de Receitas
CREATE TABLE IF NOT EXISTS revenue_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Categorias de Despesas
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 3. TABELA DE RECEITAS
-- =============================================

CREATE TABLE IF NOT EXISTS revenues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES revenue_categories(id) ON DELETE SET NULL,
    item VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    payment_method payment_method NOT NULL DEFAULT 'pix',
    due_date DATE NOT NULL,
    paid_date DATE,
    status financial_status NOT NULL DEFAULT 'pending',
    
    -- Associações opcionais
    team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    
    -- Recorrência
    is_recurring BOOLEAN DEFAULT false,
    recurrence_period recurrence_period,
    parent_revenue_id UUID REFERENCES revenues(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 4. TABELA DE DESPESAS
-- =============================================

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    item VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    payment_method payment_method NOT NULL DEFAULT 'pix',
    due_date DATE NOT NULL,
    paid_date DATE,
    status financial_status NOT NULL DEFAULT 'pending',
    
    -- Recorrência
    is_recurring BOOLEAN DEFAULT false,
    recurrence_period recurrence_period,
    parent_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 5. TABELA DE CUSTO COM EQUIPE
-- =============================================

CREATE TABLE IF NOT EXISTS team_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collaborator_type collaborator_type NOT NULL,
    
    -- Apenas um destes será preenchido
    team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
    
    -- Valores
    base_salary DECIMAL(12,2) DEFAULT 0 CHECK (base_salary >= 0),
    commission DECIMAL(12,2) DEFAULT 0 CHECK (commission >= 0),
    bonus DECIMAL(12,2) DEFAULT 0 CHECK (bonus >= 0),
    deductions DECIMAL(12,2) DEFAULT 0 CHECK (deductions >= 0),
    
    -- Pagamento
    payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
    due_date DATE NOT NULL,
    paid_date DATE,
    status financial_status NOT NULL DEFAULT 'pending',
    
    notes TEXT,
    reference_month INTEGER CHECK (reference_month >= 1 AND reference_month <= 12),
    reference_year INTEGER CHECK (reference_year >= 2020),
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraint: apenas um colaborador pode ser referenciado
    CONSTRAINT only_one_collaborator CHECK (
        (team_member_id IS NOT NULL AND professional_id IS NULL) OR
        (team_member_id IS NULL AND professional_id IS NOT NULL) OR
        (team_member_id IS NULL AND professional_id IS NULL)
    )
);

-- =============================================
-- 6. TABELA DE CAMPANHAS DE MARKETING
-- =============================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    origin marketing_origin NOT NULL,
    
    -- Investimento e métricas
    investment DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (investment >= 0),
    leads_count INTEGER DEFAULT 0 CHECK (leads_count >= 0),
    conversions_count INTEGER DEFAULT 0 CHECK (conversions_count >= 0),
    
    -- Período
    start_date DATE NOT NULL,
    end_date DATE,
    status campaign_status NOT NULL DEFAULT 'active',
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 7. ÍNDICES
-- =============================================

-- Revenue Categories
CREATE INDEX IF NOT EXISTS idx_revenue_categories_user ON revenue_categories(user_id);

-- Expense Categories
CREATE INDEX IF NOT EXISTS idx_expense_categories_user ON expense_categories(user_id);

-- Revenues
CREATE INDEX IF NOT EXISTS idx_revenues_user ON revenues(user_id);
CREATE INDEX IF NOT EXISTS idx_revenues_category ON revenues(category_id);
CREATE INDEX IF NOT EXISTS idx_revenues_status ON revenues(status);
CREATE INDEX IF NOT EXISTS idx_revenues_due_date ON revenues(due_date);
CREATE INDEX IF NOT EXISTS idx_revenues_team_member ON revenues(team_member_id);
CREATE INDEX IF NOT EXISTS idx_revenues_professional ON revenues(professional_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_due_date ON expenses(due_date);

-- Team Costs
CREATE INDEX IF NOT EXISTS idx_team_costs_user ON team_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_team_costs_team_member ON team_costs(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_costs_professional ON team_costs(professional_id);
CREATE INDEX IF NOT EXISTS idx_team_costs_due_date ON team_costs(due_date);
CREATE INDEX IF NOT EXISTS idx_team_costs_reference ON team_costs(reference_year, reference_month);

-- Marketing Campaigns
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_user ON marketing_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_origin ON marketing_campaigns(origin);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_dates ON marketing_campaigns(start_date, end_date);

-- =============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Revenue Categories
ALTER TABLE revenue_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own revenue categories" ON revenue_categories;
CREATE POLICY "Users can view own revenue categories" ON revenue_categories
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own revenue categories" ON revenue_categories;
CREATE POLICY "Users can insert own revenue categories" ON revenue_categories
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own revenue categories" ON revenue_categories;
CREATE POLICY "Users can update own revenue categories" ON revenue_categories
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own revenue categories" ON revenue_categories;
CREATE POLICY "Users can delete own revenue categories" ON revenue_categories
    FOR DELETE USING (user_id = auth.uid());

-- Expense Categories
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own expense categories" ON expense_categories;
CREATE POLICY "Users can view own expense categories" ON expense_categories
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own expense categories" ON expense_categories;
CREATE POLICY "Users can insert own expense categories" ON expense_categories
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own expense categories" ON expense_categories;
CREATE POLICY "Users can update own expense categories" ON expense_categories
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own expense categories" ON expense_categories;
CREATE POLICY "Users can delete own expense categories" ON expense_categories
    FOR DELETE USING (user_id = auth.uid());

-- Revenues
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own revenues" ON revenues;
CREATE POLICY "Users can view own revenues" ON revenues
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own revenues" ON revenues;
CREATE POLICY "Users can insert own revenues" ON revenues
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own revenues" ON revenues;
CREATE POLICY "Users can update own revenues" ON revenues
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own revenues" ON revenues;
CREATE POLICY "Users can delete own revenues" ON revenues
    FOR DELETE USING (user_id = auth.uid());

-- Expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses" ON expenses
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
CREATE POLICY "Users can insert own expenses" ON expenses
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
CREATE POLICY "Users can update own expenses" ON expenses
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
CREATE POLICY "Users can delete own expenses" ON expenses
    FOR DELETE USING (user_id = auth.uid());

-- Team Costs
ALTER TABLE team_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own team costs" ON team_costs;
CREATE POLICY "Users can view own team costs" ON team_costs
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own team costs" ON team_costs;
CREATE POLICY "Users can insert own team costs" ON team_costs
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own team costs" ON team_costs;
CREATE POLICY "Users can update own team costs" ON team_costs
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own team costs" ON team_costs;
CREATE POLICY "Users can delete own team costs" ON team_costs
    FOR DELETE USING (user_id = auth.uid());

-- Marketing Campaigns
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Users can view own marketing campaigns" ON marketing_campaigns
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Users can insert own marketing campaigns" ON marketing_campaigns
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Users can update own marketing campaigns" ON marketing_campaigns
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own marketing campaigns" ON marketing_campaigns;
CREATE POLICY "Users can delete own marketing campaigns" ON marketing_campaigns
    FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 9. TRIGGERS PARA UPDATED_AT
-- =============================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para revenue_categories
DROP TRIGGER IF EXISTS update_revenue_categories_updated_at ON revenue_categories;
CREATE TRIGGER update_revenue_categories_updated_at
    BEFORE UPDATE ON revenue_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para expense_categories
DROP TRIGGER IF EXISTS update_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para revenues
DROP TRIGGER IF EXISTS update_revenues_updated_at ON revenues;
CREATE TRIGGER update_revenues_updated_at
    BEFORE UPDATE ON revenues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para expenses
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para team_costs
DROP TRIGGER IF EXISTS update_team_costs_updated_at ON team_costs;
CREATE TRIGGER update_team_costs_updated_at
    BEFORE UPDATE ON team_costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para marketing_campaigns
DROP TRIGGER IF EXISTS update_marketing_campaigns_updated_at ON marketing_campaigns;
CREATE TRIGGER update_marketing_campaigns_updated_at
    BEFORE UPDATE ON marketing_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 10. RPCs (FUNÇÕES)
-- =============================================

-- RPC: Resumo Financeiro Mensal
CREATE OR REPLACE FUNCTION get_financial_summary(p_month INTEGER, p_year INTEGER)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT json_build_object(
        'received', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_user_id 
            AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_receivables', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_user_id 
            AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'debited', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_user_id 
            AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE user_id = v_user_id 
            AND status = 'paid' 
            AND paid_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'future_debits', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_user_id 
            AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) + COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE user_id = v_user_id 
            AND status = 'pending' 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'overdue_revenues', COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_user_id 
            AND status = 'overdue'
        ), 0),
        'overdue_expenses', COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_user_id 
            AND status = 'overdue'
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
    v_user_id UUID;
    v_year INTEGER;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();
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
                WHERE r.user_id = v_user_id 
                AND EXTRACT(MONTH FROM r.due_date) = m.month_num
                AND EXTRACT(YEAR FROM r.due_date) = v_year
            ), 0)::DECIMAL as revenue,
            COALESCE((
                SELECT SUM(e.amount) 
                FROM expenses e 
                WHERE e.user_id = v_user_id 
                AND EXTRACT(MONTH FROM e.due_date) = m.month_num
                AND EXTRACT(YEAR FROM e.due_date) = v_year
            ), 0)::DECIMAL + COALESCE((
                SELECT SUM(tc.base_salary + tc.commission + tc.bonus - tc.deductions) 
                FROM team_costs tc 
                WHERE tc.user_id = v_user_id 
                AND tc.reference_month = m.month_num
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
    v_user_id UUID;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();

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
        WHERE tm.user_id = v_user_id
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
    v_user_id UUID;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();

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
        WHERE p.user_id = v_user_id
        GROUP BY p.id, p.name, p.photo_url
    ) as professional_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- RPC: Processar Entradas Recorrentes (para cron job)
CREATE OR REPLACE FUNCTION process_recurring_entries()
RETURNS JSON
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_new_revenues INTEGER := 0;
    v_new_expenses INTEGER := 0;
    v_revenue RECORD;
    v_expense RECORD;
    v_new_due_date DATE;
BEGIN
    -- Processar receitas recorrentes
    FOR v_revenue IN 
        SELECT * FROM revenues 
        WHERE is_recurring = true 
        AND parent_revenue_id IS NULL
        AND status IN ('paid', 'pending')
    LOOP
        -- Calcular próxima data de vencimento
        v_new_due_date := CASE v_revenue.recurrence_period
            WHEN 'weekly' THEN v_revenue.due_date + INTERVAL '1 week'
            WHEN 'monthly' THEN v_revenue.due_date + INTERVAL '1 month'
            WHEN 'yearly' THEN v_revenue.due_date + INTERVAL '1 year'
        END;

        -- Verificar se já existe entrada para esta data
        IF NOT EXISTS (
            SELECT 1 FROM revenues 
            WHERE parent_revenue_id = v_revenue.id 
            AND due_date = v_new_due_date
        ) AND v_new_due_date <= v_today + INTERVAL '30 days' THEN
            -- Criar nova entrada
            INSERT INTO revenues (
                user_id, category_id, item, description, amount, 
                payment_method, due_date, status, 
                team_member_id, professional_id, 
                is_recurring, recurrence_period, parent_revenue_id
            ) VALUES (
                v_revenue.user_id, v_revenue.category_id, v_revenue.item, v_revenue.description, v_revenue.amount,
                v_revenue.payment_method, v_new_due_date, 'pending',
                v_revenue.team_member_id, v_revenue.professional_id,
                false, NULL, v_revenue.id
            );
            v_new_revenues := v_new_revenues + 1;
        END IF;
    END LOOP;

    -- Processar despesas recorrentes
    FOR v_expense IN 
        SELECT * FROM expenses 
        WHERE is_recurring = true 
        AND parent_expense_id IS NULL
        AND status IN ('paid', 'pending')
    LOOP
        -- Calcular próxima data de vencimento
        v_new_due_date := CASE v_expense.recurrence_period
            WHEN 'weekly' THEN v_expense.due_date + INTERVAL '1 week'
            WHEN 'monthly' THEN v_expense.due_date + INTERVAL '1 month'
            WHEN 'yearly' THEN v_expense.due_date + INTERVAL '1 year'
        END;

        -- Verificar se já existe entrada para esta data
        IF NOT EXISTS (
            SELECT 1 FROM expenses 
            WHERE parent_expense_id = v_expense.id 
            AND due_date = v_new_due_date
        ) AND v_new_due_date <= v_today + INTERVAL '30 days' THEN
            -- Criar nova entrada
            INSERT INTO expenses (
                user_id, category_id, item, description, amount, 
                payment_method, due_date, status,
                is_recurring, recurrence_period, parent_expense_id
            ) VALUES (
                v_expense.user_id, v_expense.category_id, v_expense.item, v_expense.description, v_expense.amount,
                v_expense.payment_method, v_new_due_date, 'pending',
                false, NULL, v_expense.id
            );
            v_new_expenses := v_new_expenses + 1;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'new_revenues', v_new_revenues,
        'new_expenses', v_new_expenses,
        'processed_at', now()
    );
END;
$$;

-- RPC: Atualizar Status de Vencidos
CREATE OR REPLACE FUNCTION update_overdue_entries()
RETURNS JSON
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_updated_revenues INTEGER;
    v_updated_expenses INTEGER;
    v_updated_team_costs INTEGER;
BEGIN
    -- Atualizar receitas vencidas
    UPDATE revenues 
    SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' 
    AND due_date < v_today;
    GET DIAGNOSTICS v_updated_revenues = ROW_COUNT;

    -- Atualizar despesas vencidas
    UPDATE expenses 
    SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' 
    AND due_date < v_today;
    GET DIAGNOSTICS v_updated_expenses = ROW_COUNT;

    -- Atualizar custos de equipe vencidos
    UPDATE team_costs 
    SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' 
    AND due_date < v_today;
    GET DIAGNOSTICS v_updated_team_costs = ROW_COUNT;

    RETURN json_build_object(
        'updated_revenues', v_updated_revenues,
        'updated_expenses', v_updated_expenses,
        'updated_team_costs', v_updated_team_costs,
        'processed_at', now()
    );
END;
$$;

-- =============================================
-- 11. CATEGORIAS PADRÃO
-- =============================================

-- Criar categorias padrão para cada novo usuário via trigger
CREATE OR REPLACE FUNCTION create_default_financial_categories()
RETURNS TRIGGER AS $$
BEGIN
    -- Categorias de Receita padrão
    INSERT INTO revenue_categories (user_id, name, description) VALUES
        (NEW.id, 'Serviços', 'Receitas de serviços prestados'),
        (NEW.id, 'Produtos', 'Receitas de vendas de produtos'),
        (NEW.id, 'Comissões', 'Receitas de comissões'),
        (NEW.id, 'Agendamentos', 'Receitas de agendamentos'),
        (NEW.id, 'Outros', 'Outras receitas');

    -- Categorias de Despesa padrão
    INSERT INTO expense_categories (user_id, name, description) VALUES
        (NEW.id, 'Infraestrutura', 'Despesas com servidores, cloud, etc'),
        (NEW.id, 'Aluguel', 'Despesas com aluguel de escritório'),
        (NEW.id, 'Software', 'Despesas com licenças de software'),
        (NEW.id, 'Utilidades', 'Internet, telefone, energia, etc'),
        (NEW.id, 'Marketing', 'Despesas com marketing e publicidade'),
        (NEW.id, 'Material', 'Material de escritório e suprimentos'),
        (NEW.id, 'Outros', 'Outras despesas');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger ao criar novo usuário em profiles
DROP TRIGGER IF EXISTS on_profile_created_add_financial_categories ON profiles;
CREATE TRIGGER on_profile_created_add_financial_categories
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_financial_categories();

-- =============================================
-- 12. GRANT PERMISSIONS PARA SERVICE ROLE
-- =============================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON revenue_categories TO service_role;
GRANT ALL ON expense_categories TO service_role;
GRANT ALL ON revenues TO service_role;
GRANT ALL ON expenses TO service_role;
GRANT ALL ON team_costs TO service_role;
GRANT ALL ON marketing_campaigns TO service_role;
