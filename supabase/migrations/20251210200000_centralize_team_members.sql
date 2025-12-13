-- =============================================
-- Migration: Centralizar Atendentes em team_members
-- Criado em: 2025-12-10
-- =============================================

-- 1. Adicionar coluna avatar_url em team_members se não existir
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Criar team_member para usuário existente (Bruno)
INSERT INTO public.team_members (
    user_id,
    name,
    email,
    phone,
    role,
    avatar_url
) VALUES (
    '3e21175c-b183-4041-b375-eacb292e8d41',
    'Bruno de Oliveira Silva',
    'bruno.leroia@gmail.com',
    '37999575427',
    'admin'::user_role,
    'https://swfshqvvbohnahdyndch.supabase.co/storage/v1/object/public/avatars/3e21175c-b183-4041-b375-eacb292e8d41-0.8383166424989634.ico'
)
ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url;

-- 3. Trigger para criar team_member automaticamente em novo cadastro
CREATE OR REPLACE FUNCTION create_team_member_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Criar team_member como admin para novos cadastros (donos de conta)
    INSERT INTO public.team_members (
        user_id,
        name,
        email,
        phone,
        role,
        avatar_url
    ) VALUES (
        NEW.id,
        COALESCE(NEW.full_name, NEW.email, 'Usuário'),
        NEW.email,
        NEW.phone,
        'admin'::user_role,
        NEW.avatar_url
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_insert_create_team_member ON public.profiles;
CREATE TRIGGER on_profile_insert_create_team_member
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION create_team_member_on_profile_insert();

-- 4. Trigger para sincronizar updates de profiles para team_members
CREATE OR REPLACE FUNCTION sync_profile_to_team_member()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.team_members SET
        name = COALESCE(NEW.full_name, name),
        email = COALESCE(NEW.email, email),
        phone = COALESCE(NEW.phone, phone),
        avatar_url = COALESCE(NEW.avatar_url, avatar_url),
        updated_at = now()
    WHERE user_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_update_sync_team_member ON public.profiles;
CREATE TRIGGER on_profile_update_sync_team_member
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION sync_profile_to_team_member();

-- 5. Atualizar função is_admin() para verificar em team_members
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função auxiliar para obter team_member_id do usuário logado
CREATE OR REPLACE FUNCTION get_current_team_member_id()
RETURNS UUID AS $$
DECLARE
    v_team_member_id UUID;
BEGIN
    SELECT id INTO v_team_member_id 
    FROM public.team_members 
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    RETURN v_team_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. REMOVER FK EXISTENTE ANTES DE ATUALIZAR DADOS
-- A FK atual aponta para auth.users, precisa ser removida
ALTER TABLE public.crm_deals 
DROP CONSTRAINT IF EXISTS crm_deals_responsible_id_fkey;

-- 8. Atualizar crm_deals.responsible_id existentes para usar team_members.id
-- Os deals atuais têm responsible_id = profiles.id (user_id)
-- Vamos atualizar para usar o correspondente team_members.id
UPDATE public.crm_deals d
SET responsible_id = tm.id
FROM public.team_members tm
WHERE d.responsible_id = tm.user_id
  AND d.responsible_id IS NOT NULL;

-- 9. Comentários para documentação
COMMENT ON FUNCTION get_current_team_member_id() IS 'Retorna o team_member_id do usuário logado';
COMMENT ON FUNCTION is_admin() IS 'Verifica se o usuário logado é admin baseado em team_members.role';
COMMENT ON TRIGGER on_profile_insert_create_team_member ON public.profiles IS 'Cria automaticamente um team_member quando um novo profile é criado';
COMMENT ON TRIGGER on_profile_update_sync_team_member ON public.profiles IS 'Sincroniza dados de profiles para team_members em updates';

