-- =============================================
-- FIX: Corrigir RLS das tabelas restantes
-- Data: 2025-12-15 10:17
-- Tabelas: ia_config, crm_funnels, professionals, 
--          revenues, expenses, team_costs, marketing_campaigns,
--          revenue_categories, expense_categories, profiles
-- =============================================

-- 1. ia_config
DO $$
DECLARE
    pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ia_config') THEN
        -- Drop all existing policies
        FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'ia_config' LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.ia_config', pol.policyname);
        END LOOP;
        -- Create new policy
        CREATE POLICY "ia_config_all" ON public.ia_config 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 2. crm_funnels
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'crm_funnels') THEN
        DROP POLICY IF EXISTS "Team can view crm_funnels" ON public.crm_funnels;
        DROP POLICY IF EXISTS "Team can manage crm_funnels" ON public.crm_funnels;
        DROP POLICY IF EXISTS "crm_funnels_all" ON public.crm_funnels;
        CREATE POLICY "crm_funnels_all" ON public.crm_funnels 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 3. professionals
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'professionals') THEN
        DROP POLICY IF EXISTS "Team can view professionals" ON public.professionals;
        DROP POLICY IF EXISTS "Team can manage professionals" ON public.professionals;
        DROP POLICY IF EXISTS "professionals_all" ON public.professionals;
        CREATE POLICY "professionals_all" ON public.professionals 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 4. revenues
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'revenues') THEN
        DROP POLICY IF EXISTS "Team can view revenues" ON public.revenues;
        DROP POLICY IF EXISTS "Team can manage revenues" ON public.revenues;
        DROP POLICY IF EXISTS "revenues_all" ON public.revenues;
        CREATE POLICY "revenues_all" ON public.revenues 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 5. expenses
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expenses') THEN
        DROP POLICY IF EXISTS "Team can view expenses" ON public.expenses;
        DROP POLICY IF EXISTS "Team can manage expenses" ON public.expenses;
        DROP POLICY IF EXISTS "expenses_all" ON public.expenses;
        CREATE POLICY "expenses_all" ON public.expenses 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 6. team_costs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'team_costs') THEN
        DROP POLICY IF EXISTS "Team can view team_costs" ON public.team_costs;
        DROP POLICY IF EXISTS "Team can manage team_costs" ON public.team_costs;
        DROP POLICY IF EXISTS "team_costs_all" ON public.team_costs;
        CREATE POLICY "team_costs_all" ON public.team_costs 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 7. marketing_campaigns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marketing_campaigns') THEN
        DROP POLICY IF EXISTS "Team can view marketing_campaigns" ON public.marketing_campaigns;
        DROP POLICY IF EXISTS "Team can manage marketing_campaigns" ON public.marketing_campaigns;
        DROP POLICY IF EXISTS "marketing_campaigns_all" ON public.marketing_campaigns;
        CREATE POLICY "marketing_campaigns_all" ON public.marketing_campaigns 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 8. revenue_categories
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'revenue_categories') THEN
        DROP POLICY IF EXISTS "Team can view revenue_categories" ON public.revenue_categories;
        DROP POLICY IF EXISTS "Team can manage revenue_categories" ON public.revenue_categories;
        DROP POLICY IF EXISTS "revenue_categories_all" ON public.revenue_categories;
        CREATE POLICY "revenue_categories_all" ON public.revenue_categories 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 9. expense_categories
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expense_categories') THEN
        DROP POLICY IF EXISTS "Team can view expense_categories" ON public.expense_categories;
        DROP POLICY IF EXISTS "Team can manage expense_categories" ON public.expense_categories;
        DROP POLICY IF EXISTS "expense_categories_all" ON public.expense_categories;
        CREATE POLICY "expense_categories_all" ON public.expense_categories 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 10. profiles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
        DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
        CREATE POLICY "profiles_all" ON public.profiles 
            FOR ALL TO authenticated 
            USING (id = auth.uid()) 
            WITH CHECK (id = auth.uid());
    END IF;
END $$;

-- 11. appointments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'appointments') THEN
        DROP POLICY IF EXISTS "Team can view appointments" ON public.appointments;
        DROP POLICY IF EXISTS "Team can manage appointments" ON public.appointments;
        DROP POLICY IF EXISTS "appointments_all" ON public.appointments;
        CREATE POLICY "appointments_all" ON public.appointments 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 12. crm_deals
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'crm_deals') THEN
        DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
        DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;
        DROP POLICY IF EXISTS "crm_deals_all" ON public.crm_deals;
        CREATE POLICY "crm_deals_all" ON public.crm_deals 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 13. tasks - Verificar se tem coluna user_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'user_id'
    ) THEN
        DROP POLICY IF EXISTS "tasks_all" ON public.tasks;
        CREATE POLICY "tasks_all" ON public.tasks 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 14. copilot_messages
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'copilot_messages') THEN
        DROP POLICY IF EXISTS "Team can view copilot" ON public.copilot_messages;
        DROP POLICY IF EXISTS "Team can manage copilot" ON public.copilot_messages;
        DROP POLICY IF EXISTS "copilot_messages_all" ON public.copilot_messages;
        CREATE POLICY "copilot_messages_all" ON public.copilot_messages 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 15. scheduled_messages
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'scheduled_messages') THEN
        DROP POLICY IF EXISTS "scheduled_messages_all" ON public.scheduled_messages;
        CREATE POLICY "scheduled_messages_all" ON public.scheduled_messages 
            FOR ALL TO authenticated 
            USING (user_id = get_owner_id()) 
            WITH CHECK (user_id = get_owner_id());
    END IF;
END $$;

-- 16. contact_tags
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contact_tags') THEN
        DROP POLICY IF EXISTS "contact_tags_all" ON public.contact_tags;
        -- contact_tags não tem user_id diretamente, usar TRUE para relação N-M
        CREATE POLICY "contact_tags_all" ON public.contact_tags 
            FOR ALL TO authenticated 
            USING (true) 
            WITH CHECK (true);
    END IF;
END $$;

-- DEBUG: Log what get_owner_id returns
DO $$
BEGIN
    RAISE NOTICE 'RLS policies updated for all tables using get_owner_id()';
END $$;
