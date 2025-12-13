-- =============================================
-- FINANCIAL REPORTS TABLE
-- Stores AI-generated financial reports
-- =============================================

-- Create financial_reports table
CREATE TABLE IF NOT EXISTS financial_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Report content (structured JSON from AI)
    content JSONB NOT NULL DEFAULT '{}',
    
    -- Raw data snapshot for reference
    raw_data JSONB DEFAULT '{}',
    
    -- Metadata
    status VARCHAR(50) DEFAULT 'completed',
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_financial_reports_user ON financial_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_reports_dates ON financial_reports(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_financial_reports_created ON financial_reports(created_at DESC);

-- Enable RLS
ALTER TABLE financial_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own reports" ON financial_reports;
CREATE POLICY "Users can view own reports" ON financial_reports
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own reports" ON financial_reports;
CREATE POLICY "Users can insert own reports" ON financial_reports
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own reports" ON financial_reports;
CREATE POLICY "Users can delete own reports" ON financial_reports
    FOR DELETE USING (user_id = auth.uid());

-- Add team member access for viewing reports
DROP POLICY IF EXISTS "Team members can view reports" ON financial_reports;
CREATE POLICY "Team members can view reports" ON financial_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.auth_user_id = auth.uid()
            AND tm.user_id = financial_reports.user_id
            AND tm.role IN ('supervisor', 'admin')
        )
    );
