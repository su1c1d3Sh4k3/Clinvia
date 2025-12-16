-- =============================================
-- FIX: follow_up_categories RLS policy
-- Data: 2025-12-15 22:10
-- Problema: RLS usa get_owner_id() recursivo
-- =============================================

-- Dropar policies antigas
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'follow_up_categories' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.follow_up_categories', pol.policyname);
    END LOOP;
END $$;

-- Criar policy simples
CREATE POLICY "follow_up_categories_all" ON public.follow_up_categories
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());
