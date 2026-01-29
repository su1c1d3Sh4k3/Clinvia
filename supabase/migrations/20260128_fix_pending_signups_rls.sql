-- Migration: Fix pending_signups RLS policy to allow anonymous inserts
-- Date: 2026-01-28

-- Disable RLS temporarily to fix
ALTER TABLE pending_signups DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can insert pending signup" ON pending_signups;
DROP POLICY IF EXISTS "Super-admin full access pending signups" ON pending_signups;

-- Re-enable RLS
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;

-- Create policy to allow ANYONE (including anonymous) to insert
CREATE POLICY "Allow anonymous insert pending signup" ON pending_signups
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Super-admin can do everything (SELECT, UPDATE, DELETE)
CREATE POLICY "Super-admin full access pending signups" ON pending_signups
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'super-admin'
        )
    );
