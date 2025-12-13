-- =============================================
-- Migration: Adicionar auth_user_id em team_members
-- Criado em: 2025-12-11
-- =============================================

-- 1. Adicionar coluna auth_user_id para vincular ao auth.users do próprio membro
ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Criar índice único para auth_user_id (cada usuário só pode ter uma entrada)
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_auth_user_id 
ON public.team_members(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 3. Atualizar membros existentes que são admins (auth_user_id = user_id)
UPDATE public.team_members 
SET auth_user_id = user_id 
WHERE role = 'admin' AND auth_user_id IS NULL;

-- 4. Atualizar trigger de signup para setar auth_user_id corretamente
CREATE OR REPLACE FUNCTION create_team_member_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Criar team_member como admin para novos cadastros (donos de conta)
    -- Para admins: user_id = auth_user_id = próprio id
    INSERT INTO public.team_members (
        user_id,        -- owner (para admins = próprio id)
        auth_user_id,   -- auth.users.id do membro
        name,
        email,
        phone,
        role,
        avatar_url
    ) VALUES (
        NEW.id,         -- owner = próprio id para admins
        NEW.id,         -- auth_user_id = próprio id
        COALESCE(NEW.full_name, NEW.email, 'Usuário'),
        NEW.email,
        NEW.phone,
        'admin'::user_role,
        NEW.avatar_url
    )
    ON CONFLICT (user_id) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Comentário para documentação
COMMENT ON COLUMN public.team_members.auth_user_id IS 'ID do usuário no auth.users (usado para login e identificação do membro)';
COMMENT ON COLUMN public.team_members.user_id IS 'ID do owner/admin da conta (todos membros da mesma conta compartilham este ID)';
