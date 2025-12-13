-- =============================================
-- Migration: Corrigir RLS de tabelas adicionais
-- Criado em: 2025-12-11
-- 
-- Esta migration corrige as tabelas que ainda não estavam
-- usando a função get_owner_id() para multi-tenant.
-- =============================================

-- 1. Atualizar policies de team_members
-- O team_members precisa permitir que membros vejam outros membros do mesmo owner
DROP POLICY IF EXISTS "Users can view their own team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can insert their own team members" ON public.team_members;  
DROP POLICY IF EXISTS "Users can update their own team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can delete their own team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can view their team members" ON public.team_members;
DROP POLICY IF EXISTS "Team can view team_members" ON public.team_members;
DROP POLICY IF EXISTS "Team can manage team_members" ON public.team_members;

CREATE POLICY "Team can view team_members" ON public.team_members
    FOR SELECT TO authenticated 
    USING (get_owner_id() = user_id);

CREATE POLICY "Team can manage team_members" ON public.team_members
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 2. Atualizar policies de tasks
-- Tasks dependem de task_boards, então precisamos atualizar para usar get_owner_id
DROP POLICY IF EXISTS "Users can view tasks on boards they have access to" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert tasks on boards they have access to" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks on boards they have access to" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete tasks on boards they have access to" ON public.tasks;

CREATE POLICY "Team can view tasks" ON public.tasks
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (get_owner_id() = task_boards.user_id OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can insert tasks" ON public.tasks
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = board_id
            AND (get_owner_id() = task_boards.user_id OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can update tasks" ON public.tasks
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (get_owner_id() = task_boards.user_id OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can delete tasks" ON public.tasks
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (get_owner_id() = task_boards.user_id OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

-- 3. Garantir que task_boards usa get_owner_id() (já criado na migration anterior, mas vamos garantir)
DROP POLICY IF EXISTS "Team can view task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can insert task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can update task_boards" ON public.task_boards;
DROP POLICY IF EXISTS "Team can delete task_boards" ON public.task_boards;

CREATE POLICY "Team can view task_boards" ON public.task_boards
    FOR SELECT TO authenticated 
    USING (get_owner_id() = user_id OR auth.uid() = ANY(allowed_agents));

CREATE POLICY "Team can insert task_boards" ON public.task_boards
    FOR INSERT TO authenticated 
    WITH CHECK (get_owner_id() = user_id);

CREATE POLICY "Team can update task_boards" ON public.task_boards
    FOR UPDATE TO authenticated 
    USING (get_owner_id() = user_id);

CREATE POLICY "Team can delete task_boards" ON public.task_boards
    FOR DELETE TO authenticated 
    USING (get_owner_id() = user_id);

-- 4. Verificar e corrigir profiles (para que membros possam ver profiles em algumas situações)
-- Isso é para evitar o erro 406 quando buscar dados de profiles (avatar, etc)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Team can view profiles" ON public.profiles;

-- Profiles do owner devem ser visíveis para membros
CREATE POLICY "Team can view own profile or owner profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR id = get_owner_id());

-- Usuários só podem atualizar seu próprio perfil
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

-- 5. Atualizar RLS de team_costs
DROP POLICY IF EXISTS "Users can view their own team_costs" ON public.team_costs;
DROP POLICY IF EXISTS "Users can insert their own team_costs" ON public.team_costs;
DROP POLICY IF EXISTS "Users can update their own team_costs" ON public.team_costs;
DROP POLICY IF EXISTS "Users can delete their own team_costs" ON public.team_costs;
DROP POLICY IF EXISTS "Team can manage team_costs" ON public.team_costs;

CREATE POLICY "Team can manage team_costs" ON public.team_costs
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 6. Atualizar RLS de marketing_campaigns
DROP POLICY IF EXISTS "Users can view their own marketing_campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can insert their own marketing_campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can update their own marketing_campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can delete their own marketing_campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Team can manage marketing_campaigns" ON public.marketing_campaigns;

CREATE POLICY "Team can manage marketing_campaigns" ON public.marketing_campaigns
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 7. Atualizar função RPC get_revenue_by_agent para usar get_owner_id()
DROP FUNCTION IF EXISTS get_revenue_by_agent();
CREATE OR REPLACE FUNCTION get_revenue_by_agent()
RETURNS TABLE (
    id uuid,
    name text,
    photo text,
    revenue numeric,
    transactions bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.id,
        tm.name,
        tm.avatar_url as photo,
        COALESCE(SUM(r.amount), 0) as revenue,
        COUNT(r.id) as transactions
    FROM team_members tm
    LEFT JOIN revenues r ON r.team_member_id = tm.id
    WHERE tm.user_id = get_owner_id()
    GROUP BY tm.id, tm.name, tm.avatar_url
    HAVING COUNT(r.id) > 0
    ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 8. Atualizar função get_financial_summary se existir
DROP FUNCTION IF EXISTS get_financial_summary(integer, integer);
CREATE OR REPLACE FUNCTION get_financial_summary(p_month integer, p_year integer)
RETURNS TABLE (
    total_revenue numeric,
    total_expenses numeric,
    total_team_costs numeric,
    total_marketing numeric,
    balance numeric
) AS $$
DECLARE
    v_owner_id uuid;
    v_start_date date;
    v_end_date date;
BEGIN
    v_owner_id := get_owner_id();
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
    
    RETURN QUERY
    SELECT 
        COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_owner_id 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) as total_revenue,
        COALESCE((
            SELECT SUM(amount) FROM expenses 
            WHERE user_id = v_owner_id 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) as total_expenses,
        COALESCE((
            SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
            WHERE user_id = v_owner_id 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) as total_team_costs,
        COALESCE((
            SELECT SUM(investment) FROM marketing_campaigns 
            WHERE user_id = v_owner_id 
            AND start_date BETWEEN v_start_date AND v_end_date
        ), 0) as total_marketing,
        -- balance = revenue - (expenses + team + marketing)
        COALESCE((
            SELECT SUM(amount) FROM revenues 
            WHERE user_id = v_owner_id 
            AND due_date BETWEEN v_start_date AND v_end_date
        ), 0) - (
            COALESCE((
                SELECT SUM(amount) FROM expenses 
                WHERE user_id = v_owner_id 
                AND due_date BETWEEN v_start_date AND v_end_date
            ), 0) +
            COALESCE((
                SELECT SUM(base_salary + commission + bonus - deductions) FROM team_costs 
                WHERE user_id = v_owner_id 
                AND due_date BETWEEN v_start_date AND v_end_date
            ), 0) +
            COALESCE((
                SELECT SUM(investment) FROM marketing_campaigns 
                WHERE user_id = v_owner_id 
                AND start_date BETWEEN v_start_date AND v_end_date
            ), 0)
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
