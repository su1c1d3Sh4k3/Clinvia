-- =============================================
-- Migration: Token Tracking System
-- Date: 2026-01-06
-- =============================================

-- 1. Add columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tokens_total BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_monthly BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS approximate_cost_total DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS approximate_cost_monthly DECIMAL(10,4) DEFAULT 0;

-- 2. Add columns to team_members
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS tokens_total BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS approximate_cost_total DECIMAL(10,4) DEFAULT 0;

-- 3. Create token_monthly_history table (for charts)
CREATE TABLE IF NOT EXISTS token_monthly_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    total_tokens BIGINT DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, year_month)
);

-- 4. Create token_usage_log table (detailed log)
CREATE TABLE IF NOT EXISTS token_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    team_member_id UUID,
    function_name TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_token_usage_log_owner ON token_usage_log(owner_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_log_created ON token_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_token_monthly_history_profile ON token_monthly_history(profile_id);

-- 5. Function to track token usage
CREATE OR REPLACE FUNCTION track_token_usage(
    p_owner_id UUID,
    p_team_member_id UUID,
    p_function_name TEXT,
    p_model TEXT,
    p_prompt_tokens INT,
    p_completion_tokens INT,
    p_cost_usd DECIMAL
) RETURNS VOID AS $$
DECLARE
    v_total_tokens INT;
BEGIN
    v_total_tokens := p_prompt_tokens + p_completion_tokens;
    
    -- Insert detailed log
    INSERT INTO token_usage_log (
        owner_id, team_member_id, function_name, model,
        prompt_tokens, completion_tokens, total_tokens, cost_usd
    ) VALUES (
        p_owner_id, p_team_member_id, p_function_name, p_model,
        p_prompt_tokens, p_completion_tokens, v_total_tokens, p_cost_usd
    );
    
    -- Update profile (ALWAYS - all tokens go here)
    UPDATE profiles SET
        tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
        tokens_monthly = COALESCE(tokens_monthly, 0) + v_total_tokens,
        approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd,
        approximate_cost_monthly = COALESCE(approximate_cost_monthly, 0) + p_cost_usd
    WHERE id = p_owner_id;
    
    -- Update team_member (only if identified - individual tracking)
    IF p_team_member_id IS NOT NULL THEN
        UPDATE team_members SET
            tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
            approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd
        WHERE id = p_team_member_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function for monthly reset (runs on day 1)
CREATE OR REPLACE FUNCTION reset_monthly_tokens() RETURNS VOID AS $$
BEGIN
    -- Save history before reset
    INSERT INTO token_monthly_history (profile_id, year_month, total_tokens, total_cost)
    SELECT 
        id, 
        TO_CHAR(NOW() - INTERVAL '1 day', 'YYYY-MM'), 
        COALESCE(tokens_monthly, 0), 
        COALESCE(approximate_cost_monthly, 0)
    FROM profiles
    WHERE COALESCE(tokens_monthly, 0) > 0
    ON CONFLICT (profile_id, year_month) DO UPDATE SET
        total_tokens = EXCLUDED.total_tokens,
        total_cost = EXCLUDED.total_cost;
    
    -- Reset monthly counters
    UPDATE profiles SET 
        tokens_monthly = 0, 
        approximate_cost_monthly = 0;
        
    RAISE NOTICE 'Monthly token reset completed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS for token_monthly_history
ALTER TABLE token_monthly_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own token history" ON token_monthly_history;
CREATE POLICY "Users can view own token history" ON token_monthly_history
    FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Super-admin can view all token history" ON token_monthly_history;
CREATE POLICY "Super-admin can view all token history" ON token_monthly_history
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super-admin')
    );

-- 8. RLS for token_usage_log
ALTER TABLE token_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own token logs" ON token_usage_log;
CREATE POLICY "Users can view own token logs" ON token_usage_log
    FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Super-admin can view all token logs" ON token_usage_log;
CREATE POLICY "Super-admin can view all token logs" ON token_usage_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super-admin')
    );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION track_token_usage TO authenticated;
GRANT EXECUTE ON FUNCTION track_token_usage TO service_role;
GRANT EXECUTE ON FUNCTION reset_monthly_tokens TO service_role;
