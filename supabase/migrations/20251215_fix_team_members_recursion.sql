-- =============================================
-- FIX DEFINITIVO: Corrigir recursão infinita em team_members
-- Data: 2025-12-15 10:06
-- Erro: 42P17 - infinite recursion detected in policy
-- =============================================

-- 1. DROPAR TODAS AS POLICIES DE team_members
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'team_members' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_members', pol.policyname);
    END LOOP;
END $$;

-- 2. CRIAR POLICIES SIMPLES SEM SUBQUERIES
-- Para SELECT: usuário pode ver onde auth_user_id = auth.uid() OU user_id = auth.uid()
CREATE POLICY "tm_view_own" ON public.team_members
    FOR SELECT TO authenticated
    USING (
        auth_user_id = auth.uid() 
        OR user_id = auth.uid()
    );

-- Para INSERT/UPDATE/DELETE: apenas o owner (user_id = auth.uid())
CREATE POLICY "tm_manage" ON public.team_members
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 3. RECRIAR get_owner_id() de forma SEGURA (sem consultar team_members diretamente)
DROP FUNCTION IF EXISTS get_owner_id() CASCADE;

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
    -- Buscar user_id em team_members onde auth_user_id = auth.uid()
    -- SECURITY DEFINER permite bypassar RLS
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Se encontrou, retorna
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Fallback: buscar onde user_id = auth.uid() (para admins diretos)
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

-- 4. GARANTIR QUE AS OUTRAS TABELAS USAM get_owner_id() CORRETAMENTE
-- Contacts
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'contacts' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.contacts', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "contacts_all" ON public.contacts
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Queues
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'queues' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.queues', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "queues_all" ON public.queues
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Tags
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tags' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tags', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "tags_all" ON public.tags
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Conversations
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'conversations' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "conversations_all" ON public.conversations
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Messages
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'messages' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "messages_all" ON public.messages
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Instances
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'instances' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.instances', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "instances_all" ON public.instances
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- Products/Services
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'products_services' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.products_services', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "products_all" ON public.products_services
    FOR ALL TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- CRM Stages (verificar se existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'crm_stages') THEN
        EXECUTE 'DROP POLICY IF EXISTS "crm_stages_all" ON public.crm_stages';
        EXECUTE 'CREATE POLICY "crm_stages_all" ON public.crm_stages FOR ALL TO authenticated USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id())';
    END IF;
END $$;

-- Deals (verificar se existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deals') THEN
        EXECUTE 'DROP POLICY IF EXISTS "deals_all" ON public.deals';
        EXECUTE 'CREATE POLICY "deals_all" ON public.deals FOR ALL TO authenticated USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id())';
    END IF;
END $$;

-- Tasks (verificar se existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tasks') THEN
        EXECUTE 'DROP POLICY IF EXISTS "tasks_all" ON public.tasks';
    END IF;
END $$;

-- Task_Boards (verificar se existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_boards') THEN
        EXECUTE 'DROP POLICY IF EXISTS "task_boards_all" ON public.task_boards';
        EXECUTE 'CREATE POLICY "task_boards_all" ON public.task_boards FOR ALL TO authenticated USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id())';
    END IF;
END $$;

-- Notifications - NÃO TEM user_id, pular

-- Follow Up Templates (verificar se existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follow_up_templates') THEN
        EXECUTE 'DROP POLICY IF EXISTS "follow_up_all" ON public.follow_up_templates';
        EXECUTE 'CREATE POLICY "follow_up_all" ON public.follow_up_templates FOR ALL TO authenticated USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id())';
    END IF;
END $$;

-- 5. CRIAR FUNÇÃO DE DEBUG
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
        ) t)
    ) INTO result;
    
    RETURN result;
END;
$$;
