-- =====================================================
-- Profile deactivation (soft-block) with 30-day grace period
-- =====================================================
-- Fluxo:
--   1. Admin clica "Desativar" → admin_deactivate_profile() → deactivated_at = now()
--   2. Cliente tenta logar → check_account_deactivation() detecta e bloqueia com
--      mensagem de conta bloqueada + X dias restantes.
--   3. Admin vê no painel: badge com "Xd restantes" até chegar em 0, depois
--      "Conta Vencida" (admin decide excluir definitivamente).
--   4. Admin clica "Reativar" → admin_reactivate_profile() → deactivated_at = NULL.
-- =====================================================

-- ─── 1. Coluna deactivated_at ────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_at
    ON public.profiles (deactivated_at)
    WHERE deactivated_at IS NOT NULL;

-- ─── 2. RPCs admin: desativar / reativar ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_deactivate_profile(p_profile_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;

    IF p_profile_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot deactivate your own admin account';
    END IF;

    UPDATE public.profiles
    SET deactivated_at = now(), updated_at = now()
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    RETURN json_build_object('success', true, 'deactivated_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_profile(p_profile_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;

    UPDATE public.profiles
    SET deactivated_at = NULL, updated_at = now()
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    RETURN json_build_object('success', true);
END;
$$;

-- ─── 3. RPC de verificação pós-login (chamado pelo useAuth) ─────────────────

CREATE OR REPLACE FUNCTION public.check_account_deactivation()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deactivated_at TIMESTAMPTZ;
    v_days_elapsed INT;
    v_days_remaining INT;
    v_retention_days INT := 30;  -- dias até exclusão definitiva após desativação
BEGIN
    SELECT deactivated_at INTO v_deactivated_at
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_deactivated_at IS NULL THEN
        RETURN json_build_object('is_deactivated', false);
    END IF;

    v_days_elapsed := GREATEST(0, EXTRACT(DAY FROM now() - v_deactivated_at)::INT);
    v_days_remaining := GREATEST(0, v_retention_days - v_days_elapsed);

    RETURN json_build_object(
        'is_deactivated', true,
        'deactivated_at', v_deactivated_at,
        'days_remaining', v_days_remaining,
        'is_expired', v_days_remaining = 0,
        'retention_days', v_retention_days
    );
END;
$$;

-- ─── 4. Atualizar admin_get_all_profiles para retornar deactivated_at ───────

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
    deactivated_at TIMESTAMPTZ,
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
    SELECT p.role INTO v_caller_role
    FROM public.profiles p
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
        p.deactivated_at,
        p.created_at,
        COUNT(*) OVER() AS total_count
    FROM public.profiles p
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

-- ─── 5. Grants ───────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.admin_deactivate_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_account_deactivation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles(TEXT, INT, INT) TO authenticated;
