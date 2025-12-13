-- =============================================
-- Migration: Add commission field to team_members
-- =============================================
-- Permite definir uma porcentagem de comissão (0-100) para cada membro da equipe
-- Quando uma receita é lançada com um atendente que possui comissão > 0,
-- uma despesa de comissão é criada automaticamente
-- =============================================

-- 1. Adicionar coluna commission à tabela team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0;

-- 2. Adicionar constraint de range (0-100)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'team_members_commission_range'
    ) THEN
        ALTER TABLE team_members 
        ADD CONSTRAINT team_members_commission_range 
        CHECK (commission >= 0 AND commission <= 100);
    END IF;
END $$;

-- 3. Atualizar RPC get_revenue_by_agent para incluir commissionRate e commissionTotal
DROP FUNCTION IF EXISTS get_revenue_by_agent();

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
    WHERE user_id = v_user_id OR auth_user_id = v_user_id
    LIMIT 1;

    -- Se admin ou supervisor, mostrar todos os atendentes
    -- Se agent, mostrar apenas os próprios dados
    SELECT json_agg(agent_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT 
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(tm.commission, 0)::DECIMAL as "commissionRate",
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COALESCE(SUM(r.amount) * COALESCE(tm.commission, 0) / 100, 0)::DECIMAL as "commissionTotal",
            COUNT(DISTINCT r.id)::INTEGER as transactions
        FROM public.team_members tm
        LEFT JOIN public.revenues r ON r.team_member_id = tm.id AND r.status = 'paid'
        WHERE 
            CASE 
                WHEN v_user_role IN ('admin', 'supervisor') THEN true
                ELSE tm.user_id = v_user_id OR tm.auth_user_id = v_user_id
            END
        GROUP BY tm.id, tm.name, tm.avatar_url, tm.commission
        HAVING COALESCE(SUM(r.amount), 0) > 0 OR v_user_role IN ('admin', 'supervisor')
    ) as agent_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- 4. Adicionar comentário de documentação
COMMENT ON COLUMN team_members.commission IS 'Porcentagem de comissão (0-100) do membro. Quando uma receita é criada com este atendente, uma despesa de comissão é gerada automaticamente.';

COMMENT ON FUNCTION get_revenue_by_agent() IS 'Retorna receitas agrupadas por atendente com commissionRate e commissionTotal. Admins/Supervisores veem todos, Agents veem apenas seus dados.';
