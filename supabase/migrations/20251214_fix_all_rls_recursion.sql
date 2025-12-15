-- =============================================
-- FIX DEFINITIVO v2: Garantir que RLS funciona
-- Data: 2025-12-14 21:15
-- =============================================

-- 1. GARANTIR QUE RLS ESTÁ HABILITADO
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenues FORCE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_costs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members FORCE ROW LEVEL SECURITY;

-- 2. RECRIAR get_owner_id() de forma mais simples
DROP FUNCTION IF EXISTS get_owner_id() CASCADE;

CREATE OR REPLACE FUNCTION get_owner_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT COALESCE(
        (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid() LIMIT 1),
        (SELECT user_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1),
        auth.uid()
    );
$$;

-- 3. DROPAR TODAS AS POLICIES DE CONTACTS E RECRIAR
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'contacts' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.contacts', pol.policyname);
    END LOOP;
END $$;

-- 4. CRIAR POLICIES SIMPLES PARA CONTACTS
CREATE POLICY "contacts_select" ON public.contacts
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "contacts_insert" ON public.contacts
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "contacts_update" ON public.contacts
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "contacts_delete" ON public.contacts
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());

-- 5. DROPAR TODAS AS POLICIES DE team_members E RECRIAR SEM RECURSÃO
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'team_members' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_members', pol.policyname);
    END LOOP;
END $$;

-- team_members: sem usar get_owner_id() para evitar recursão
CREATE POLICY "tm_select" ON public.team_members
    FOR SELECT TO authenticated
    USING (
        auth_user_id = auth.uid() 
        OR user_id = auth.uid()
        OR user_id = (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1)
    );

CREATE POLICY "tm_all" ON public.team_members
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR user_id = (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1)
    )
    WITH CHECK (
        user_id = auth.uid()
        OR user_id = (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1)
    );

-- 6. CRIAR FUNÇÃO DE DEBUG que pode ser chamada da aplicação
CREATE OR REPLACE FUNCTION debug_owner_info()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'auth_uid', auth.uid(),
        'get_owner_id', get_owner_id(),
        'team_member', (SELECT row_to_json(t) FROM (
            SELECT id, user_id, auth_user_id, name, role 
            FROM public.team_members 
            WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
            LIMIT 1
        ) t),
        'contacts_count', (SELECT COUNT(*) FROM public.contacts WHERE user_id = get_owner_id()),
        'total_contacts', (SELECT COUNT(*) FROM public.contacts)
    ) INTO result;
    
    RETURN result;
END;
$$;

COMMENT ON FUNCTION debug_owner_info() IS 'Função de debug - chame do console da aplicação';
