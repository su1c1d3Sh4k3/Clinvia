-- =============================================
-- SOLUÇÃO DEFINITIVA: RPC para buscar patients
-- Bypassando RLS com SECURITY DEFINER
-- Data: 2026-01-22
-- =============================================

-- 1. DESABILITAR RLS TEMPORARIAMENTE PARA VER SE É O PROBLEMA
-- (Se funcionar, sabemos que é RLS. Se não, é outro problema.)
-- ALTER TABLE public.patients DISABLE ROW LEVEL SECURITY;

-- 2. CRIAR FUNÇÃO RPC PARA BUSCAR PATIENTS (igual ao get_my_owner_id)
CREATE OR REPLACE FUNCTION get_my_patients()
RETURNS SETOF patients
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Buscar owner_id do usuário logado
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Fallback para admin
    IF v_owner_id IS NULL THEN
        SELECT user_id INTO v_owner_id
        FROM public.team_members
        WHERE user_id = auth.uid()
        LIMIT 1;
    END IF;
    
    -- Último fallback
    IF v_owner_id IS NULL THEN
        v_owner_id := auth.uid();
    END IF;
    
    -- Retornar todos os patients do owner
    RETURN QUERY
    SELECT *
    FROM public.patients
    WHERE patients.user_id = v_owner_id
    ORDER BY nome;
END;
$$;

-- Dar permissão para usuários autenticados executarem
GRANT EXECUTE ON FUNCTION get_my_patients() TO authenticated;

-- 3. ALTERNATIVA: CORRIGIR RLS DE VEZ
-- Dropar TODAS as policies
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'patients' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.patients', pol.policyname);
    END LOOP;
END $$;

-- Garantir que RLS está ativado
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Criar policy simples e direta
CREATE POLICY "patients_all" ON public.patients
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- 4. VERIFICAÇÃO: Ver políticas atuais
-- SELECT * FROM pg_policies WHERE tablename = 'patients';
