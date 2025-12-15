-- =============================================
-- FIX: Corrigir função get_owner_id()
-- Data: 2025-12-14 21:00
-- =============================================
-- A função deve retornar o user_id do team_members onde auth_user_id = auth.uid()
-- =============================================

-- Recriar função get_owner_id() corretamente
CREATE OR REPLACE FUNCTION get_owner_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Buscar user_id em team_members onde auth_user_id = usuário logado
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Se encontrou, retorna o user_id
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Fallback: buscar onde user_id = auth.uid() (para admins)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Último fallback: retorna auth.uid()
    RETURN auth.uid();
END;
$$;

-- Verificar que a RLS de contacts usa get_owner_id()
DROP POLICY IF EXISTS "Team can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can delete contacts" ON public.contacts;

CREATE POLICY "Team can view contacts" ON public.contacts
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "Team can insert contacts" ON public.contacts
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can update contacts" ON public.contacts
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can delete contacts" ON public.contacts
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());
