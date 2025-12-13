-- =============================================
-- Migration: RLS de Deals - Versão Simplificada
-- Criado em: 2025-12-11
-- 
-- Abordagem sem funções helper - lógica direta na policy
-- =============================================

-- Dropar policies existentes de crm_deals
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;

-- NOTA: NÃO dropar funções is_agent() e get_my_team_member_id() pois são usadas em outras policies

-- Policy de SELECT com lógica inline
-- A lógica é:
-- 1. Deal deve pertencer ao owner (get_owner_id() = user_id)
-- 2. E uma das condições:
--    a) Usuário NÃO é 'agent' (é admin ou supervisor)
--    b) OU deal está atribuído ao team_member do usuário
CREATE POLICY "Team can view crm_deals" ON public.crm_deals
    FOR SELECT TO authenticated 
    USING (
        -- Deal pertence ao owner
        get_owner_id() = user_id
        AND
        (
            -- Usuário não é agent (admin/supervisor vê tudo)
            NOT EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE (tm.auth_user_id = auth.uid() OR tm.user_id = auth.uid())
                AND tm.role = 'agent'
            )
            OR
            -- Ou o deal está atribuído ao usuário
            EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE (tm.auth_user_id = auth.uid() OR tm.user_id = auth.uid())
                AND tm.id = crm_deals.responsible_id
            )
        )
    );

-- Policy de gerenciamento - todos podem gerenciar deals do owner
CREATE POLICY "Team can manage crm_deals" ON public.crm_deals
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);
