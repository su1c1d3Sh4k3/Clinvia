-- Fix crm_deals RLS to allow updates
-- The 409 Conflict error indicates the RLS is blocking updates

-- First, drop all existing crm_deals policies
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "crm_deals_all" ON public.crm_deals;
DROP POLICY IF EXISTS "Users can view their own deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Users can manage their own deals" ON public.crm_deals;

-- Create a simple, permissive policy for all operations
-- Using SECURITY DEFINER function get_owner_id() 
CREATE POLICY "crm_deals_access" ON public.crm_deals
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Ensure RLS is enabled
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
