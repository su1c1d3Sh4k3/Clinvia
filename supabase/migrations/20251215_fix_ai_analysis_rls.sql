-- =============================================
-- FIX: ai_analysis RLS policy
-- Data: 2025-12-15 22:26
-- Problema: RLS usa auth.uid() mas precisa usar get_owner_id()
-- =============================================

-- Dropar policies antigas
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_analysis' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.ai_analysis', pol.policyname);
    END LOOP;
END $$;

-- Criar policy usando get_owner_id()
CREATE POLICY "ai_analysis_all" ON public.ai_analysis
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());
