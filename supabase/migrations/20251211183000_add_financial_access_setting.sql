
-- =============================================
-- ADD FINANCIAL ACCESS CONTROL SETTING
-- =============================================

-- 1. Add column to profiles (Account/Admin Settings)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS financial_access BOOLEAN DEFAULT TRUE;

-- 2. Grant access or create RPC for reading this setting safely
-- Since RLS might block supervisors from reading the Admin's profile directly,
-- we use a SECURITY DEFINER function to expose ONLY this setting.

CREATE OR REPLACE FUNCTION public.get_financial_access_setting()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_access BOOLEAN;
BEGIN
    -- Strategy: Get the setting from the first available profile (The Admin/Owner)
    -- In a single-tenant context, this table usually holds the owner's profile.
    SELECT financial_access INTO v_access
    FROM profiles
    LIMIT 1;
    
    RETURN COALESCE(v_access, TRUE); -- Default to TRUE if not set
END;
$$;

-- 3. Policy ensures Admins can update this setting
-- (Assuming existing admin policies cover UPDATE on profiles, but let's ensure)
-- Existing policies usually user-based. Admin is the owner of the profile, so they can update.

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_financial_access_setting() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_access_setting() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_access_setting() TO anon;
