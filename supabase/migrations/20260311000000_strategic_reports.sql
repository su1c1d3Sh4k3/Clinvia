-- =============================================================
-- Migration: Strategic Reports System
-- Creates tables for automated strategic report generation
-- =============================================================

-- 1. Create attendance_status type for appointments
DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('pending', 'attended', 'no_show', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add attendance_status column to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS attendance_status attendance_status DEFAULT 'pending';

-- 3. Create strategic_reports table
CREATE TABLE IF NOT EXISTS strategic_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_number   INTEGER NOT NULL,
  report_type     TEXT NOT NULL,
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  previous_data   JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 4. Create report_preferences table
CREATE TABLE IF NOT EXISTS report_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  active_types    TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 5. Indices
CREATE INDEX IF NOT EXISTS idx_strategic_reports_user ON strategic_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_strategic_reports_type ON strategic_reports(report_type, frequency);
CREATE INDEX IF NOT EXISTS idx_strategic_reports_date ON strategic_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategic_reports_period ON strategic_reports(user_id, frequency, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_preferences_user ON report_preferences(user_id);

-- 6. RLS for strategic_reports
ALTER TABLE strategic_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strategic reports" ON strategic_reports
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT tm.user_id FROM team_members tm WHERE tm.auth_user_id = auth.uid())
  );

CREATE POLICY "Users can insert own strategic reports" ON strategic_reports
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT tm.user_id FROM team_members tm WHERE tm.auth_user_id = auth.uid())
  );

CREATE POLICY "Service role full access strategic reports" ON strategic_reports
  FOR ALL USING (auth.role() = 'service_role');

-- 7. RLS for report_preferences
ALTER TABLE report_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own report preferences" ON report_preferences
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT tm.user_id FROM team_members tm WHERE tm.auth_user_id = auth.uid())
  );

CREATE POLICY "Users can manage own report preferences" ON report_preferences
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (SELECT tm.user_id FROM team_members tm WHERE tm.auth_user_id = auth.uid())
  );

CREATE POLICY "Service role full access report preferences" ON report_preferences
  FOR ALL USING (auth.role() = 'service_role');

-- 8. Function to generate next report_number for a user
CREATE OR REPLACE FUNCTION get_next_report_number(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(report_number), 0) + 1
  INTO next_num
  FROM strategic_reports
  WHERE user_id = p_user_id;

  -- Wrap around at 9999
  IF next_num > 9999 THEN
    next_num := 1;
  END IF;

  RETURN next_num;
END;
$$;

-- 9. Updated_at trigger for report_preferences
CREATE OR REPLACE FUNCTION update_report_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_preferences_updated_at
  BEFORE UPDATE ON report_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_report_preferences_updated_at();
