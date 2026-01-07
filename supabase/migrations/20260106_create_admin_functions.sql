-- Migration: Create Super-Admin and Admin Functions
-- ================================================

-- 1. Create super-admin user (will be executed via Supabase Dashboard or CLI)
-- Note: User creation must be done through Auth API, not SQL directly

-- 2. Function to get all profiles (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles(
    p_search TEXT DEFAULT '',
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    company_name TEXT,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Verify caller is super-admin
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.company_name,
        p.email,
        p.role,
        p.created_at,
        COUNT(*) OVER() as total_count
    FROM profiles p
    WHERE 
        p_search = '' OR 
        p.full_name ILIKE '%' || p_search || '%' OR 
        p.company_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%'
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 3. Function to get team_members for a profile
CREATE OR REPLACE FUNCTION public.admin_get_team_members(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    role TEXT,
    email TEXT,
    phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;
    
    RETURN QUERY
    SELECT tm.id, tm.name, tm.role::TEXT, tm.email, tm.phone
    FROM team_members tm
    WHERE tm.user_id = p_user_id;
END;
$$;

-- 4. Function to get professionals for a profile
CREATE OR REPLACE FUNCTION public.admin_get_professionals(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    role TEXT,
    photo_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;
    
    RETURN QUERY
    SELECT pr.id, pr.name, pr.role, pr.photo_url
    FROM professionals pr
    WHERE pr.user_id = p_user_id;
END;
$$;

-- 5. Function to get appointment stats for a profile
CREATE OR REPLACE FUNCTION public.admin_get_appointment_stats(p_user_id UUID)
RETURNS TABLE (
    status TEXT,
    count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;
    
    RETURN QUERY
    SELECT a.status, COUNT(*)
    FROM appointments a
    WHERE a.user_id = p_user_id
    GROUP BY a.status;
END;
$$;

-- 6. Function to get conversation/ticket stats for a profile
CREATE OR REPLACE FUNCTION public.admin_get_conversation_stats(p_user_id UUID)
RETURNS TABLE (
    status TEXT,
    count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;
    
    RETURN QUERY
    SELECT c.status, COUNT(*)
    FROM conversations c
    WHERE c.user_id = p_user_id
    GROUP BY c.status;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_team_members TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_professionals TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_appointment_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_conversation_stats TO authenticated;
