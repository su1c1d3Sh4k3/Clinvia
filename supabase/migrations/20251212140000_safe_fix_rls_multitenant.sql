-- =============================================
-- Migration SEGURA: Atualizar RLS Policies para Multi-Tenant
-- Versão corrigida com DROP IF EXISTS para todas as policies
-- Pode ser executada múltiplas vezes (idempotente)
-- =============================================

-- 1. Criar função helper que retorna o owner_id do usuário logado
CREATE OR REPLACE FUNCTION get_owner_id()
RETURNS UUID AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Primeiro tenta buscar por auth_user_id (membros de equipe)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid();
    
    -- Se encontrou, retorna o user_id (owner)
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Fallback: busca por user_id (admins onde user_id = auth.uid)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE user_id = auth.uid() AND role = 'admin';
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Se não encontrou em team_members, retorna o próprio auth.uid()
    -- (para compatibilidade com admins antigos)
    RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 2. ia_config
-- =============================================
DROP POLICY IF EXISTS "Users can view their own ia_config" ON public.ia_config;
DROP POLICY IF EXISTS "Users can manage their own ia_config" ON public.ia_config;
DROP POLICY IF EXISTS "Team can view ia_config" ON public.ia_config;
DROP POLICY IF EXISTS "Team can manage ia_config" ON public.ia_config;
CREATE POLICY "Team can view ia_config" ON public.ia_config
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage ia_config" ON public.ia_config
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 3. copilot
-- =============================================
DROP POLICY IF EXISTS "Users can view their own copilot settings" ON public.copilot;
DROP POLICY IF EXISTS "Users can insert their own copilot settings" ON public.copilot;
DROP POLICY IF EXISTS "Users can update their own copilot settings" ON public.copilot;
DROP POLICY IF EXISTS "Team can view copilot settings" ON public.copilot;
DROP POLICY IF EXISTS "Team can insert copilot settings" ON public.copilot;
DROP POLICY IF EXISTS "Team can update copilot settings" ON public.copilot;
CREATE POLICY "Team can view copilot settings" ON public.copilot
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can insert copilot settings" ON public.copilot
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update copilot settings" ON public.copilot
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 4. instances
-- =============================================
DROP POLICY IF EXISTS "Users can view their own instances" ON public.instances;
DROP POLICY IF EXISTS "Users can manage their own instances" ON public.instances;
DROP POLICY IF EXISTS "Team can view instances" ON public.instances;
DROP POLICY IF EXISTS "Team can manage instances" ON public.instances;
CREATE POLICY "Team can view instances" ON public.instances
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage instances" ON public.instances
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 5. contacts
-- =============================================
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can manage contacts" ON public.contacts;
CREATE POLICY "Team can view contacts" ON public.contacts
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage contacts" ON public.contacts
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 6. conversations
-- =============================================
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can manage their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team can manage conversations" ON public.conversations;
CREATE POLICY "Team can view conversations" ON public.conversations
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage conversations" ON public.conversations
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 7. messages
-- =============================================
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can manage their own messages" ON public.messages;
DROP POLICY IF EXISTS "Team can view messages" ON public.messages;
DROP POLICY IF EXISTS "Team can manage messages" ON public.messages;
CREATE POLICY "Team can view messages" ON public.messages
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage messages" ON public.messages
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 8. queues
-- =============================================
DROP POLICY IF EXISTS "Users can view their own queues" ON public.queues;
DROP POLICY IF EXISTS "Users can insert their own queues" ON public.queues;
DROP POLICY IF EXISTS "Users can update their own queues" ON public.queues;
DROP POLICY IF EXISTS "Users can delete their own queues" ON public.queues;
DROP POLICY IF EXISTS "Team can view queues" ON public.queues;
DROP POLICY IF EXISTS "Team can insert queues" ON public.queues;
DROP POLICY IF EXISTS "Team can update queues" ON public.queues;
DROP POLICY IF EXISTS "Team can delete queues" ON public.queues;
CREATE POLICY "Team can view queues" ON public.queues
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can insert queues" ON public.queues
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update queues" ON public.queues
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can delete queues" ON public.queues
    FOR DELETE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 9. tags
-- =============================================
DROP POLICY IF EXISTS "Users can view their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can insert their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can update their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can delete their own tags" ON public.tags;
DROP POLICY IF EXISTS "Team can view tags" ON public.tags;
DROP POLICY IF EXISTS "Team can insert tags" ON public.tags;
DROP POLICY IF EXISTS "Team can update tags" ON public.tags;
DROP POLICY IF EXISTS "Team can delete tags" ON public.tags;
CREATE POLICY "Team can view tags" ON public.tags
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can insert tags" ON public.tags
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update tags" ON public.tags
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can delete tags" ON public.tags
    FOR DELETE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 10. quick_messages
-- =============================================
DROP POLICY IF EXISTS "Users can view their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can insert their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can update their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can delete their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can view quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can insert quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can update quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can delete quick_messages" ON public.quick_messages;
CREATE POLICY "Team can view quick_messages" ON public.quick_messages
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can insert quick_messages" ON public.quick_messages
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update quick_messages" ON public.quick_messages
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can delete quick_messages" ON public.quick_messages
    FOR DELETE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 11. products_services
-- =============================================
DROP POLICY IF EXISTS "Users can manage their own products services" ON public.products_services;
DROP POLICY IF EXISTS "Team can manage products_services" ON public.products_services;
CREATE POLICY "Team can manage products_services" ON public.products_services
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 12. CRM - crm_funnels
-- =============================================
DROP POLICY IF EXISTS "Users can view their own funnels" ON public.crm_funnels;
DROP POLICY IF EXISTS "Users can manage their own funnels" ON public.crm_funnels;
DROP POLICY IF EXISTS "Team can view crm_funnels" ON public.crm_funnels;
DROP POLICY IF EXISTS "Team can manage crm_funnels" ON public.crm_funnels;
CREATE POLICY "Team can view crm_funnels" ON public.crm_funnels
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage crm_funnels" ON public.crm_funnels
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 13. CRM - crm_stages
-- =============================================
DROP POLICY IF EXISTS "Users can view their own stages" ON public.crm_stages;
DROP POLICY IF EXISTS "Users can manage their own stages" ON public.crm_stages;
DROP POLICY IF EXISTS "Team can view crm_stages" ON public.crm_stages;
DROP POLICY IF EXISTS "Team can manage crm_stages" ON public.crm_stages;
CREATE POLICY "Team can view crm_stages" ON public.crm_stages
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage crm_stages" ON public.crm_stages
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 14. CRM - crm_deals
-- =============================================
DROP POLICY IF EXISTS "Users can view their own deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Users can manage their own deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;
CREATE POLICY "Team can view crm_deals" ON public.crm_deals
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage crm_deals" ON public.crm_deals
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 15. Financial - revenue_categories
-- =============================================
DROP POLICY IF EXISTS "Users can view own revenue categories" ON public.revenue_categories;
DROP POLICY IF EXISTS "Users can insert own revenue categories" ON public.revenue_categories;
DROP POLICY IF EXISTS "Users can update own revenue categories" ON public.revenue_categories;
DROP POLICY IF EXISTS "Users can delete own revenue categories" ON public.revenue_categories;
DROP POLICY IF EXISTS "Team can manage revenue_categories" ON public.revenue_categories;
CREATE POLICY "Team can manage revenue_categories" ON public.revenue_categories
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 16. Financial - expense_categories
-- =============================================
DROP POLICY IF EXISTS "Users can view own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can insert own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can update own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can delete own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Team can manage expense_categories" ON public.expense_categories;
CREATE POLICY "Team can manage expense_categories" ON public.expense_categories
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 17. Financial - revenues (PRINCIPAL PARA CORREÇÃO DO ERRO)
-- =============================================
DROP POLICY IF EXISTS "Users can view own revenues" ON public.revenues;
DROP POLICY IF EXISTS "Users can insert own revenues" ON public.revenues;
DROP POLICY IF EXISTS "Users can update own revenues" ON public.revenues;
DROP POLICY IF EXISTS "Users can delete own revenues" ON public.revenues;
DROP POLICY IF EXISTS "Team can manage revenues" ON public.revenues;
CREATE POLICY "Team can manage revenues" ON public.revenues
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 18. Financial - expenses
-- =============================================
DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Team can manage expenses" ON public.expenses;
CREATE POLICY "Team can manage expenses" ON public.expenses
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 19. ai_analysis
-- =============================================
DROP POLICY IF EXISTS "Users can view their own ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "Users can manage their own ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "Team can view ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "Team can manage ai_analysis" ON public.ai_analysis;
CREATE POLICY "Team can view ai_analysis" ON public.ai_analysis
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can manage ai_analysis" ON public.ai_analysis
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- 20. task_boards
-- =============================================
DROP POLICY IF EXISTS "Users can view their own boards or boards they are allowed in" ON public.task_boards;
DROP POLICY IF EXISTS "Users can insert their own boards" ON public.task_boards;
DROP POLICY IF EXISTS "Users can update their own boards" ON public.task_boards;
DROP POLICY IF EXISTS "Users can delete their own boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can view task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can insert task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can update task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can delete task_boards" ON public.task_boards;
CREATE POLICY "Team can view task_boards" ON public.task_boards
    FOR SELECT TO authenticated USING (get_owner_id() = user_id OR auth.uid() = ANY(allowed_agents));
CREATE POLICY "Team can insert task_boards" ON public.task_boards
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update task_boards" ON public.task_boards
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can delete task_boards" ON public.task_boards
    FOR DELETE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 21. professionals
-- =============================================
DROP POLICY IF EXISTS "Users can view all professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can insert own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can update own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can delete own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can manage their own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Team can view professionals" ON public.professionals;
DROP POLICY IF EXISTS "Team can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Team can update professionals" ON public.professionals;
DROP POLICY IF EXISTS "Team can delete professionals" ON public.professionals;
CREATE POLICY "Team can view professionals" ON public.professionals
    FOR SELECT TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can insert professionals" ON public.professionals
    FOR INSERT TO authenticated WITH CHECK (get_owner_id() = user_id);
CREATE POLICY "Team can update professionals" ON public.professionals
    FOR UPDATE TO authenticated USING (get_owner_id() = user_id);
CREATE POLICY "Team can delete professionals" ON public.professionals
    FOR DELETE TO authenticated USING (get_owner_id() = user_id);

-- =============================================
-- 22. appointments
-- =============================================
DROP POLICY IF EXISTS "Users can manage their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Team can manage appointments" ON public.appointments;
CREATE POLICY "Team can manage appointments" ON public.appointments
    FOR ALL TO authenticated USING (get_owner_id() = user_id) WITH CHECK (get_owner_id() = user_id);

-- =============================================
-- FIM DA MIGRATION SEGURA
-- =============================================
