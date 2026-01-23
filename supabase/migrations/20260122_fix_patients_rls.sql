-- Fix patients RLS policies to support team member access
-- Uses get_owner_id() function like other tables

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own patients" ON patients;
DROP POLICY IF EXISTS "Users can insert their own patients" ON patients;
DROP POLICY IF EXISTS "Users can update their own patients" ON patients;
DROP POLICY IF EXISTS "Users can delete their own patients" ON patients;

-- Create new policies using get_owner_id() function
-- This allows both admins and team members to access patients
CREATE POLICY "Users can view their own patients" ON patients
    FOR SELECT USING (user_id = get_owner_id());

CREATE POLICY "Users can insert their own patients" ON patients
    FOR INSERT WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Users can update their own patients" ON patients
    FOR UPDATE USING (user_id = get_owner_id());

CREATE POLICY "Users can delete their own patients" ON patients
    FOR DELETE USING (user_id = get_owner_id());
