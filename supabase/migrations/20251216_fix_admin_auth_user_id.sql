-- =============================================
-- FIX: Corrigir auth_user_id NULL para admins
-- Data: 2025-12-16
-- Problema: auth_user_id está NULL, causando get_owner_id() = NULL
-- =============================================

-- 1. Corrigir admins existentes que têm auth_user_id NULL
-- Para admins, auth_user_id deve ser igual a user_id
UPDATE public.team_members
SET auth_user_id = user_id
WHERE role = 'admin' AND auth_user_id IS NULL;

-- 2. Garantir que o trigger de signup está correto
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Ignorar se é membro de equipe criado pelo admin
    IF (NEW.raw_user_meta_data->>'is_team_member') = 'true' THEN
        RETURN NEW;
    END IF;

    -- Extrair nome do usuário
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name', 
        split_part(NEW.email, '@', 1)
    );

    -- 1. Criar profile
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (NEW.id, v_name, NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Criar team_member com user_id = auth_user_id = NEW.id (admin é owner de si mesmo)
    INSERT INTO public.team_members (user_id, auth_user_id, name, full_name, email, role)
    VALUES (NEW.id, NEW.id, v_name, v_name, NEW.email, 'admin'::user_role)
    ON CONFLICT (user_id) DO UPDATE SET 
        auth_user_id = EXCLUDED.auth_user_id;  -- Garante que auth_user_id seja setado

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 3. Verificar correção
SELECT id, user_id, auth_user_id, name, role 
FROM team_members 
WHERE role = 'admin';
