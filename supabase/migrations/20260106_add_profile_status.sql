-- =============================================
-- Migration: Create pending_signups table + Admin functions
-- Date: 2026-01-06 v2
-- =============================================

-- 1. Add status and must_change_password to profiles (for active users)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Add check constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check'
    ) THEN
        ALTER TABLE profiles 
        ADD CONSTRAINT profiles_status_check 
        CHECK (status IN ('ativo', 'inativo', 'pendente'));
    END IF;
END $$;

-- Update existing profiles to 'ativo'
UPDATE profiles SET status = 'ativo' WHERE status IS NULL;

-- =============================================
-- 2. Create pending_signups table for new registrations
-- =============================================
CREATE TABLE IF NOT EXISTS pending_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT,
    company_name TEXT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    instagram TEXT,
    address TEXT,
    status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'rejeitado')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (anonymous signup)
DROP POLICY IF EXISTS "Anyone can insert pending signup" ON pending_signups;
CREATE POLICY "Anyone can insert pending signup" ON pending_signups
    FOR INSERT
    WITH CHECK (true);

-- Super-admin can do everything
DROP POLICY IF EXISTS "Super-admin full access pending signups" ON pending_signups;
CREATE POLICY "Super-admin full access pending signups" ON pending_signups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'super-admin'
        )
    );

-- =============================================
-- 3. Function to get pending signups (SECURITY DEFINER)
-- =============================================
DROP FUNCTION IF EXISTS public.admin_get_pending_profiles();
CREATE OR REPLACE FUNCTION public.admin_get_pending_profiles()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    address TEXT,
    created_at TIMESTAMPTZ
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
        ps.id,
        ps.full_name,
        ps.company_name,
        ps.email,
        ps.phone,
        ps.instagram,
        ps.address,
        ps.created_at
    FROM pending_signups ps
    WHERE ps.status = 'pendente'
    ORDER BY ps.created_at DESC;
END;
$$;

-- =============================================
-- 4. Function to get rejected signups (inactive)
-- =============================================
DROP FUNCTION IF EXISTS public.admin_get_inactive_profiles();
CREATE OR REPLACE FUNCTION public.admin_get_inactive_profiles()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    instagram TEXT,
    address TEXT,
    created_at TIMESTAMPTZ
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
    SELECT 
        ps.id,
        ps.full_name,
        ps.company_name,
        ps.email,
        ps.phone,
        ps.instagram,
        ps.address,
        ps.created_at
    FROM pending_signups ps
    WHERE ps.status = 'rejeitado'
    ORDER BY ps.created_at DESC;
END;
$$;

-- =============================================
-- 5. Update admin_get_all_profiles to filter by status='ativo'
-- =============================================
DROP FUNCTION IF EXISTS public.admin_get_all_profiles(TEXT, INT, INT);
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
    phone TEXT,
    instagram TEXT,
    address TEXT,
    role TEXT,
    status TEXT,
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
        p.phone,
        p.instagram,
        p.address,
        p.role,
        p.status,
        p.created_at,
        COUNT(*) OVER() as total_count
    FROM profiles p
    WHERE 
        (p.status = 'ativo' OR p.status IS NULL) AND
        (
            p_search = '' OR 
            p.full_name ILIKE '%' || p_search || '%' OR 
            p.company_name ILIKE '%' || p_search || '%' OR
            p.email ILIKE '%' || p_search || '%'
        )
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_get_pending_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_inactive_profiles TO authenticated;
