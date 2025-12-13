-- =============================================
-- Migration: Corrigir Função get_revenue_by_agent()
-- =============================================
-- PROBLEMA: A função filtrava apenas o team_member do usuário logado
--           não mostrando receitas de outros atendentes para admins
-- SOLUÇÃO:  Admins/Supervisores veem todos. Agents veem apenas seus dados.
-- =============================================

-- Recriar função get_revenue_by_agent() corrigida
CREATE OR REPLACE FUNCTION get_revenue_by_agent()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();
    
    -- Buscar role do usuário em team_members
    SELECT role INTO v_user_role 
    FROM public.team_members 
    WHERE user_id = v_user_id;

    -- Se admin ou supervisor, mostrar todos os atendentes
    -- Se agent, mostrar apenas os próprios dados
    SELECT json_agg(agent_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COUNT(DISTINCT r.id)::INTEGER as transactions
        FROM public.team_members tm
        LEFT JOIN public.revenues r ON r.team_member_id = tm.id AND r.status = 'paid'
        WHERE 
            CASE 
                WHEN v_user_role IN ('admin', 'supervisor') THEN true
                ELSE tm.user_id = v_user_id
            END
        GROUP BY tm.id, tm.name, tm.avatar_url
        HAVING COALESCE(SUM(r.amount), 0) > 0 OR v_user_role IN ('admin', 'supervisor')
    ) as agent_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- Também corrigir get_revenue_by_professional() com mesma lógica
CREATE OR REPLACE FUNCTION get_revenue_by_professional()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();
    
    -- Buscar role do usuário em team_members
    SELECT role INTO v_user_role 
    FROM public.team_members 
    WHERE user_id = v_user_id;

    -- Se admin ou supervisor, mostrar todos os profissionais
    -- Se agent, mostrar apenas os profissionais que ele pode ver
    SELECT json_agg(professional_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            p.id,
            p.name,
            p.photo_url as photo,
            COALESCE(p.commission_rate, 0) as "commissionRate",
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COALESCE(SUM(r.amount) * COALESCE(p.commission_rate, 0) / 100, 0)::DECIMAL as "commissionTotal",
            COUNT(DISTINCT r.appointment_id)::INTEGER as appointments
        FROM public.professionals p
        LEFT JOIN public.revenues r ON r.professional_id = p.id AND r.status = 'paid'
        WHERE 
            CASE 
                WHEN v_user_role IN ('admin', 'supervisor') THEN true
                ELSE p.user_id = v_user_id
            END
        GROUP BY p.id, p.name, p.photo_url, p.commission_rate
        HAVING COALESCE(SUM(r.amount), 0) > 0 OR v_user_role IN ('admin', 'supervisor')
    ) as professional_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- Comentários de documentação
COMMENT ON FUNCTION get_revenue_by_agent() IS 'Retorna receitas agrupadas por atendente. Admins/Supervisores veem todos, Agents veem apenas seus dados.';
COMMENT ON FUNCTION get_revenue_by_professional() IS 'Retorna receitas agrupadas por profissional com comissões. Admins/Supervisores veem todos, Agents veem apenas seus dados.';
