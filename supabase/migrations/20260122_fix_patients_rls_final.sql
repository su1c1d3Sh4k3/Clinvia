-- =============================================
-- FIX FINAL: RLS para tabela patients
-- Padrão idêntico ao usado na tabela contacts
-- Data: 2026-01-22
-- =============================================

-- 1. DROPAR TODAS AS POLICIES EXISTENTES DE patients
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'patients' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.patients', pol.policyname);
    END LOOP;
END $$;

-- 2. CRIAR POLICY ÚNICA (mesmo padrão da contacts_all)
CREATE POLICY "patients_all" ON public.patients
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- 3. CONFIRMAR QUE RLS ESTÁ ATIVADO
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- 4. VERIFICAR (opcional - rode para testar)
-- SELECT 
--     auth.uid() as auth_uid,
--     get_owner_id() as owner_id,
--     (SELECT COUNT(*) FROM patients WHERE user_id = get_owner_id()) as visible_patients,
--     (SELECT COUNT(*) FROM contacts WHERE user_id = get_owner_id()) as visible_contacts;
