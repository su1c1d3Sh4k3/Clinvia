-- =============================================
-- FIX: conversation_follow_ups RLS policy
-- Data: 2025-12-15 22:23
-- Problema: RLS bloqueando inserção de follow up
-- =============================================

-- Dropar policies antigas
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'conversation_follow_ups' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversation_follow_ups', pol.policyname);
    END LOOP;
END $$;

-- Criar policy simples que permite acesso baseado no owner da conversa
CREATE POLICY "conversation_follow_ups_all" ON public.conversation_follow_ups
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND c.user_id = get_owner_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND c.user_id = get_owner_id()
        )
    );
