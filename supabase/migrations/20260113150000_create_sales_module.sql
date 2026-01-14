-- =============================================
-- MÓDULO DE VENDAS - Migration Completa
-- =============================================

-- =============================================
-- 1. TABELA PRINCIPAL DE VENDAS
-- =============================================

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Produto/Serviço
    category TEXT NOT NULL CHECK (category IN ('product', 'service')),
    product_service_id UUID NOT NULL REFERENCES products_services(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    
    -- Pagamento
    payment_type TEXT NOT NULL CHECK (payment_type IN ('cash', 'installment')),
    installments INTEGER NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 24),
    interest_rate DECIMAL(5,2) DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 100),
    
    -- Data
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Responsáveis (opcionais)
    team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
    
    -- Metadados
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. TABELA DE PARCELAS
-- =============================================

CREATE TABLE IF NOT EXISTS sale_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
    due_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    paid_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(sale_id, installment_number)
);

-- =============================================
-- 3. ÍNDICES
-- =============================================

-- Sales
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_service ON sales(product_service_id);
CREATE INDEX IF NOT EXISTS idx_sales_category ON sales(category);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_team_member ON sales(team_member_id);
CREATE INDEX IF NOT EXISTS idx_sales_professional ON sales(professional_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_type ON sales(payment_type);

-- Sale Installments
CREATE INDEX IF NOT EXISTS idx_sale_installments_sale ON sale_installments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_installments_due_date ON sale_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_sale_installments_status ON sale_installments(status);

-- =============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sales" ON sales;
CREATE POLICY "Team can view sales" ON sales
    FOR SELECT USING (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Team can insert sales" ON sales;
CREATE POLICY "Team can insert sales" ON sales
    FOR INSERT WITH CHECK (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Team can update sales" ON sales;
CREATE POLICY "Team can update sales" ON sales
    FOR UPDATE USING (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Team can delete sales" ON sales;
CREATE POLICY "Team can delete sales" ON sales
    FOR DELETE USING (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

-- Sale Installments
ALTER TABLE sale_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sale_installments" ON sale_installments;
CREATE POLICY "Team can view sale_installments" ON sale_installments
    FOR SELECT USING (
        sale_id IN (
            SELECT s.id FROM sales s
            WHERE s.user_id IN (
                SELECT tm.user_id FROM team_members tm 
                WHERE tm.user_id = auth.uid() 
                   OR tm.auth_user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Team can insert sale_installments" ON sale_installments;
CREATE POLICY "Team can insert sale_installments" ON sale_installments
    FOR INSERT WITH CHECK (
        sale_id IN (
            SELECT s.id FROM sales s
            WHERE s.user_id IN (
                SELECT tm.user_id FROM team_members tm 
                WHERE tm.user_id = auth.uid() 
                   OR tm.auth_user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Team can update sale_installments" ON sale_installments;
CREATE POLICY "Team can update sale_installments" ON sale_installments
    FOR UPDATE USING (
        sale_id IN (
            SELECT s.id FROM sales s
            WHERE s.user_id IN (
                SELECT tm.user_id FROM team_members tm 
                WHERE tm.user_id = auth.uid() 
                   OR tm.auth_user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Team can delete sale_installments" ON sale_installments;
CREATE POLICY "Team can delete sale_installments" ON sale_installments
    FOR DELETE USING (
        sale_id IN (
            SELECT s.id FROM sales s
            WHERE s.user_id IN (
                SELECT tm.user_id FROM team_members tm 
                WHERE tm.user_id = auth.uid() 
                   OR tm.auth_user_id = auth.uid()
            )
        )
    );

-- =============================================
-- 5. TRIGGERS PARA UPDATED_AT
-- =============================================

-- Trigger para sales
DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para sale_installments
DROP TRIGGER IF EXISTS update_sale_installments_updated_at ON sale_installments;
CREATE TRIGGER update_sale_installments_updated_at
    BEFORE UPDATE ON sale_installments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 6. FUNÇÃO PARA GERAR PARCELAS AUTOMATICAMENTE
-- =============================================

CREATE OR REPLACE FUNCTION generate_sale_installments()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_num INTEGER;
    v_due_date DATE;
    v_base_amount DECIMAL(12,2);
    v_interest_amount DECIMAL(12,2);
    v_installment_amount DECIMAL(12,2);
BEGIN
    -- Apenas gera parcelas para vendas parceladas
    IF NEW.payment_type = 'installment' AND NEW.installments > 1 THEN
        -- Valor base de cada parcela (sem juros)
        v_base_amount := NEW.total_amount / NEW.installments;
        
        FOR v_installment_num IN 1..NEW.installments LOOP
            -- Calcular data de vencimento (cada parcela um mês após a anterior)
            v_due_date := NEW.sale_date + (v_installment_num - 1) * INTERVAL '1 month';
            
            -- Calcular juros simples: juros = principal * taxa * tempo
            -- Primeira parcela não tem juros (mês 0)
            v_interest_amount := NEW.total_amount * (NEW.interest_rate / 100) * (v_installment_num - 1);
            v_installment_amount := v_base_amount + (v_interest_amount / NEW.installments);
            
            INSERT INTO sale_installments (
                sale_id,
                installment_number,
                due_date,
                amount,
                status
            ) VALUES (
                NEW.id,
                v_installment_num,
                v_due_date,
                ROUND(v_installment_amount, 2),
                CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END
            );
        END LOOP;
    ELSE
        -- Venda à vista: criar uma única parcela
        INSERT INTO sale_installments (
            sale_id,
            installment_number,
            due_date,
            amount,
            status
        ) VALUES (
            NEW.id,
            1,
            NEW.sale_date,
            NEW.total_amount,
            'pending'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar parcelas após inserção de venda
DROP TRIGGER IF EXISTS trigger_generate_sale_installments ON sales;
CREATE TRIGGER trigger_generate_sale_installments
    AFTER INSERT ON sales
    FOR EACH ROW EXECUTE FUNCTION generate_sale_installments();

-- =============================================
-- 7. FUNÇÃO PARA ATUALIZAR STATUS DE VENCIDAS
-- =============================================

CREATE OR REPLACE FUNCTION update_overdue_sale_installments()
RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE sale_installments
    SET status = 'overdue', updated_at = now()
    WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 8. RPCs PARA MÉTRICAS
-- =============================================

-- RPC: Resumo de Vendas do Mês
CREATE OR REPLACE FUNCTION get_sales_summary(p_month INTEGER, p_year INTEGER)
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
        'monthly_revenue', COALESCE((
            SELECT SUM(si.amount) 
            FROM sale_installments si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.user_id = v_user_id
            AND si.due_date BETWEEN v_start_date AND v_end_date
            AND si.status = 'paid'
        ), 0),
        'monthly_pending', COALESCE((
            SELECT SUM(si.amount) 
            FROM sale_installments si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.user_id = v_user_id
            AND si.due_date BETWEEN v_start_date AND v_end_date
            AND si.status IN ('pending', 'overdue')
        ), 0),
        'total_sales_count', COALESCE((
            SELECT COUNT(*) FROM sales
            WHERE user_id = v_user_id
            AND sale_date BETWEEN v_start_date AND v_end_date
        ), 0),
        'total_items_sold', COALESCE((
            SELECT SUM(quantity) FROM sales
            WHERE user_id = v_user_id
            AND sale_date BETWEEN v_start_date AND v_end_date
        ), 0)
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- RPC: Vendas Anuais (12 meses)
CREATE OR REPLACE FUNCTION get_annual_sales(p_year INTEGER DEFAULT NULL)
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
                SELECT SUM(si.amount)
                FROM sale_installments si
                JOIN sales s ON s.id = si.sale_id
                WHERE s.user_id = v_user_id
                AND EXTRACT(MONTH FROM si.due_date) = m.month_num
                AND EXTRACT(YEAR FROM si.due_date) = v_year
                AND si.status = 'paid'
            ), 0)::DECIMAL as revenue
        FROM generate_series(1, 12) as m(month_num)
    ) as month_data;
    
    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- RPC: Produto/Serviço Mais Vendido do Mês
CREATE OR REPLACE FUNCTION get_top_product_service(p_month INTEGER, p_year INTEGER)
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
        'id', ps.id,
        'name', ps.name,
        'type', ps.type,
        'total_revenue', SUM(s.total_amount),
        'quantity_sold', SUM(s.quantity)
    ) INTO v_result
    FROM sales s
    JOIN products_services ps ON ps.id = s.product_service_id
    WHERE s.user_id = v_user_id
    AND s.sale_date BETWEEN v_start_date AND v_end_date
    GROUP BY ps.id, ps.name, ps.type
    ORDER BY SUM(s.total_amount) DESC
    LIMIT 1;
    
    RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

-- RPC: Projeção de Faturamentos (parcelas futuras do ano)
CREATE OR REPLACE FUNCTION get_sales_projection(p_year INTEGER DEFAULT NULL)
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
    
    SELECT json_build_object(
        'projected_revenue', COALESCE(SUM(si.amount), 0),
        'pending_installments', COUNT(*)
    ) INTO v_result
    FROM sale_installments si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.user_id = v_user_id
    AND EXTRACT(YEAR FROM si.due_date) = v_year
    AND si.due_date > CURRENT_DATE
    AND si.status = 'pending';
    
    RETURN COALESCE(v_result, '{"projected_revenue": 0, "pending_installments": 0}'::JSON);
END;
$$;

-- RPC: Faturamento por Atendente
CREATE OR REPLACE FUNCTION get_sales_by_agent(p_month INTEGER DEFAULT NULL, p_year INTEGER DEFAULT NULL)
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
    
    IF p_month IS NOT NULL AND p_year IS NOT NULL THEN
        v_start_date := make_date(p_year, p_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSE
        v_start_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, 1);
        v_end_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 12, 31);
    END IF;
    
    SELECT json_agg(agent_data ORDER BY total_revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_revenue,
            COALESCE(SUM(s.quantity), 0)::INTEGER as quantity_sold,
            (
                SELECT ps.name
                FROM sales s2
                JOIN products_services ps ON ps.id = s2.product_service_id
                WHERE s2.team_member_id = tm.id
                AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY ps.id, ps.name
                ORDER BY SUM(s2.total_amount) DESC
                LIMIT 1
            ) as top_product
        FROM team_members tm
        LEFT JOIN sales s ON s.team_member_id = tm.id 
            AND s.sale_date BETWEEN v_start_date AND v_end_date
        WHERE tm.user_id = v_user_id
        GROUP BY tm.id, tm.name, tm.avatar_url
        HAVING SUM(s.total_amount) > 0
    ) as agent_data;
    
    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- RPC: Faturamento por Profissional
CREATE OR REPLACE FUNCTION get_sales_by_professional(p_month INTEGER DEFAULT NULL, p_year INTEGER DEFAULT NULL)
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
    
    IF p_month IS NOT NULL AND p_year IS NOT NULL THEN
        v_start_date := make_date(p_year, p_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSE
        v_start_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, 1);
        v_end_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 12, 31);
    END IF;
    
    SELECT json_agg(prof_data ORDER BY total_revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            p.id,
            p.name,
            p.photo_url as photo,
            COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_revenue,
            COALESCE(SUM(s.quantity), 0)::INTEGER as quantity_sold,
            (
                SELECT ps.name
                FROM sales s2
                JOIN products_services ps ON ps.id = s2.product_service_id
                WHERE s2.professional_id = p.id
                AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY ps.id, ps.name
                ORDER BY SUM(s2.total_amount) DESC
                LIMIT 1
            ) as top_product
        FROM professionals p
        LEFT JOIN sales s ON s.professional_id = p.id 
            AND s.sale_date BETWEEN v_start_date AND v_end_date
        WHERE p.user_id = v_user_id
        GROUP BY p.id, p.name, p.photo_url
        HAVING SUM(s.total_amount) > 0
    ) as prof_data;
    
    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- =============================================
-- 9. GRANT PERMISSIONS PARA SERVICE ROLE
-- =============================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON sales TO service_role;
GRANT ALL ON sale_installments TO service_role;
