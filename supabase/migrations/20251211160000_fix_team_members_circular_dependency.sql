-- =============================================
-- Migration: Correção de RLS - Permitir usuário ver próprio registro
-- Criado em: 2025-12-11
-- 
-- Corrige problema de dependência circular na função get_owner_id()
-- =============================================

-- 1. Atualizar policy de team_members para permitir que usuário veja seu próprio registro
DROP POLICY IF EXISTS "Team can view team_members" ON public.team_members;

CREATE POLICY "Team can view team_members" ON public.team_members
    FOR SELECT TO authenticated 
    USING (
        -- Usuário pode ver seu próprio registro (por auth_user_id)
        auth_user_id = auth.uid()
        OR
        -- Usuário pode ver registros da mesma conta (por owner_id)
        get_owner_id() = user_id
    );

-- 2. Corrigir política de crm_stages para garantir que todos os stages do owner são visíveis
-- (Já deveria estar OK, mas vamos recriar para ter certeza)
DROP POLICY IF EXISTS "Team can view crm_stages" ON public.crm_stages;
DROP POLICY IF EXISTS "Team can manage crm_stages" ON public.crm_stages;

CREATE POLICY "Team can view crm_stages" ON public.crm_stages
    FOR SELECT TO authenticated 
    USING (get_owner_id() = user_id);

CREATE POLICY "Team can manage crm_stages" ON public.crm_stages
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 3. Também garantir que crm_funnels esteja correto
DROP POLICY IF EXISTS "Team can view crm_funnels" ON public.crm_funnels;
DROP POLICY IF EXISTS "Team can manage crm_funnels" ON public.crm_funnels;

CREATE POLICY "Team can view crm_funnels" ON public.crm_funnels
    FOR SELECT TO authenticated 
    USING (get_owner_id() = user_id);

CREATE POLICY "Team can manage crm_funnels" ON public.crm_funnels
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 4. Garantir que crm_deals também esteja correto
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;

CREATE POLICY "Team can view crm_deals" ON public.crm_deals
    FOR SELECT TO authenticated 
    USING (get_owner_id() = user_id);

CREATE POLICY "Team can manage crm_deals" ON public.crm_deals
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);
