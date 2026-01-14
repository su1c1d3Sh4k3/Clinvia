-- =============================================
-- RELATÓRIOS DE VENDAS
-- =============================================

CREATE TABLE IF NOT EXISTS sales_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sales_reports_user ON sales_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_reports_dates ON sales_reports(start_date, end_date);

-- RLS
ALTER TABLE sales_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sales reports" ON sales_reports;
CREATE POLICY "Users can view own sales reports" ON sales_reports
    FOR SELECT USING (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own sales reports" ON sales_reports;
CREATE POLICY "Users can insert own sales reports" ON sales_reports
    FOR INSERT WITH CHECK (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own sales reports" ON sales_reports;
CREATE POLICY "Users can delete own sales reports" ON sales_reports
    FOR DELETE USING (
        user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    );

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_sales_reports_updated_at ON sales_reports;
CREATE TRIGGER update_sales_reports_updated_at
    BEFORE UPDATE ON sales_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant service role
GRANT ALL ON sales_reports TO service_role;
