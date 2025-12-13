-- =============================================
-- Migration: Filtrar Deals por Responsável
-- Criado em: 2025-12-11
-- 
-- Atualiza a RLS de crm_deals para:
-- - Admins veem TODOS os deals do owner
-- - Agentes e Supervisores veem apenas deals atribuídos a eles
-- =============================================

-- Dropar policies existentes de crm_deals
DROP POLICY IF EXISTS "Team can view crm_deals" ON public.crm_deals;
DROP POLICY IF EXISTS "Team can manage crm_deals" ON public.crm_deals;

-- Nova policy de SELECT: Admins veem tudo, outros veem só os seus
CREATE POLICY "Team can view crm_deals" ON public.crm_deals
    FOR SELECT TO authenticated 
    USING (
        -- Condição 1: O deal pertence ao owner do usuário logado
        get_owner_id() = user_id
        AND (
            -- Admin vê todos os deals
            EXISTS (
                SELECT 1 FROM team_members tm 
                WHERE tm.auth_user_id = auth.uid() 
                AND tm.role = 'admin'
            )
            OR
            -- Não-admin vê apenas deals onde é responsável OU sem responsável atribuído
            responsible_id IS NULL
            OR
            responsible_id = (
                SELECT id FROM team_members 
                WHERE auth_user_id = auth.uid() 
                LIMIT 1
            )
        )
    );

-- Nova policy de INSERT/UPDATE/DELETE: Qualquer membro pode gerenciar deals do owner
CREATE POLICY "Team can manage crm_deals" ON public.crm_deals
    FOR ALL TO authenticated 
    USING (get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- Garantir que a coluna responsible_id existe (já deve existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'crm_deals' 
        AND column_name = 'responsible_id'
    ) THEN
        ALTER TABLE public.crm_deals 
        ADD COLUMN responsible_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;
    END IF;
END $$;
