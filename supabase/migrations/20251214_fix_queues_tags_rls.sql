-- =============================================
-- FIX: RLS de queues e tags filtrados por owner
-- Data: 2025-12-14 21:27
-- =============================================

-- 1. HABILITAR E FORÇAR RLS
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;

-- 2. DROPAR TODAS AS POLICIES DE QUEUES
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'queues' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.queues', pol.policyname);
    END LOOP;
END $$;

-- 3. CRIAR POLICIES PARA QUEUES
CREATE POLICY "queues_select" ON public.queues
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "queues_insert" ON public.queues
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "queues_update" ON public.queues
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "queues_delete" ON public.queues
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());

-- 4. DROPAR TODAS AS POLICIES DE TAGS
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tags' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tags', pol.policyname);
    END LOOP;
END $$;

-- 5. CRIAR POLICIES PARA TAGS
CREATE POLICY "tags_select" ON public.tags
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "tags_insert" ON public.tags
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "tags_update" ON public.tags
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "tags_delete" ON public.tags
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());

-- 6. TAMBÉM CORRIGIR conversations, messages, instances
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances FORCE ROW LEVEL SECURITY;

-- DROPAR E RECRIAR POLICIES DE CONVERSATIONS
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'conversations' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "conversations_select" ON public.conversations
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "conversations_insert" ON public.conversations
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "conversations_update" ON public.conversations
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "conversations_delete" ON public.conversations
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());

-- DROPAR E RECRIAR POLICIES DE MESSAGES
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'messages' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "messages_select" ON public.messages
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "messages_insert" ON public.messages
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "messages_update" ON public.messages
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "messages_delete" ON public.messages
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());

-- DROPAR E RECRIAR POLICIES DE INSTANCES
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'instances' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.instances', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "instances_select" ON public.instances
    FOR SELECT TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "instances_insert" ON public.instances
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "instances_update" ON public.instances
    FOR UPDATE TO authenticated 
    USING (user_id = get_owner_id());

CREATE POLICY "instances_delete" ON public.instances
    FOR DELETE TO authenticated 
    USING (user_id = get_owner_id());
