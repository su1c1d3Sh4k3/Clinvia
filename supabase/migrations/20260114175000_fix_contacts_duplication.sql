-- =============================================
-- Migration: Fix Contacts Duplication and Add Constraint
-- =============================================

-- 1. Remover contatos que são grupos (identificados por @g.us)
-- Assumindo que grupos devem ser geridos apenas na tabela 'groups' ou 'group_members'
-- e NÃO devem estar na tabela 'contacts' para evitar poluição.
DELETE FROM public.contacts 
WHERE number LIKE '%@g.us' OR is_group = true;

-- 2. Deduplicar contatos (manter apenas o mais recente para cada user_id + number)
-- Se houver duplicatas (mesmo número em instâncias diferentes do mesmo user_id),
-- mantemos o registro criado mais recentemente.
DELETE FROM public.contacts
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id, 
            ROW_NUMBER() OVER (PARTITION BY user_id, number ORDER BY created_at DESC) as rnum 
        FROM public.contacts
    ) t 
    WHERE t.rnum > 1
);

-- 3. Adicionar Constraint UNIQUE (user_id, number)
-- Isso garante que não seja possível inserir o mesmo contato duas vezes para o mesmo tenant.
ALTER TABLE public.contacts 
DROP CONSTRAINT IF EXISTS contacts_user_number_key; -- Garantir que não existe

ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_user_number_key UNIQUE (user_id, number);

-- 4. Função RPC para obter o owner_id (user_id do admin) do usuário logado
-- Útil para o frontend filtrar contatos pelo ID da empresa corretamente.
CREATE OR REPLACE FUNCTION public.get_my_owner_id()
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
BEGIN
    -- Verificar se é o próprio admin (auth.uid() existe em team_members com role 'admin' E user_id igual)
    -- OU se simplesmente o ID bate com a tabela users (se houver). 
    -- Simplificação: Verificar team_members.
    
    SELECT user_id, role INTO v_user_id, v_role
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Se encontrou registro em team_members
    IF found THEN
        RETURN v_user_id;
    END IF;
    
    -- Se não encontrou (pode ser o owner recém criado antes do trigger de team_members rodar, ou caso de borda)
    -- Assume que é o próprio usuário
    RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON CONSTRAINT contacts_user_number_key ON public.contacts IS 'Garante unicidade do contato por tenant (user_id)';
