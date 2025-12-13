-- Migration: Add commission field to professionals table
-- This field stores the commission percentage (0-100) for each professional

-- Add commission column with default 0 and constraint for valid range
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS commission numeric DEFAULT 0;

-- Add constraint to ensure commission is between 0 and 100
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'professionals_commission_range'
    ) THEN
        ALTER TABLE professionals ADD CONSTRAINT professionals_commission_range CHECK (commission >= 0 AND commission <= 100);
    END IF;
END $$;

-- Add commission_revenue_id to expenses table to link commission expenses to revenues
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS commission_revenue_id uuid REFERENCES revenues(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_expenses_commission_revenue_id ON expenses(commission_revenue_id) WHERE commission_revenue_id IS NOT NULL;
