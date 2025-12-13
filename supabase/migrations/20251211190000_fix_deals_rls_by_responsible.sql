-- =============================================
-- Migration: Correção RLS de Deals por Responsável
-- Criado em: 2025-12-11
-- 
-- Corrige a policy anterior que não estava filtrando corretamente.
-- Nova lógica:
-- - Admins e Supervisores: veem TODOS os deals do owner
-- - Agentes: veem APENAS deals atribuídos a eles
-- =============================================

-- Dropar policies existentes de crm_deals
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;

-- Criar função helper para verificar se usuário é agente
CREATE OR REPLACE FUNCTION is_agent()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.team_members 
        WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
        AND role = 'agent'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Criar função helper para obter o team_member_id do usuário logado
CREATE OR REPLACE FUNCTION get_my_team_member_id()
RETURNS UUID AS $$
DECLARE
    v_tm_id UUID;
BEGIN
    SELECT id INTO v_tm_id 
    FROM public.team_members 
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1;
    RETURN v_tm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Nova policy de SELECT
-- Se é agente: só vê deals onde é responsável
-- Se NÃO é agente (admin/supervisor): vê todos os deals do owner
CREATE POLICY "Team can view crm_deals" ON public.crm_deals
    FOR SELECT TO authenticated 
    USING (
        get_owner_id() = user_id
        AND (
            -- Se NÃO é agente (admin/supervisor), vê tudo
            NOT is_agent()
            OR
            -- Se É agente, só vê os atribuídos a ele
            responsible_id = get_my_team_member_id()
        )
    );

-- Policy de gerenciamento (INSERT/UPDATE/DELETE) - todos podem gerenciar
CREATE POLICY "Team can manage crm_deals" ON public.crm_deals
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);
