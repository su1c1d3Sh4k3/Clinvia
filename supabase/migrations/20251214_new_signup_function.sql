-- =============================================
-- FUNÇÃO DE CADASTRO VIA /AUTH
-- Data: 2025-12-14 20:39
-- =============================================
-- APENAS:
-- 1. Cria profile
-- 2. Cria team_members com user_id = id do profile e role = admin
-- =============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_insert_create_team_member ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_team_member_on_profile_insert() CASCADE;

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

    -- 1. CRIAR PROFILE
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (NEW.id, v_name, NEW.raw_user_meta_data->>'avatar_url');

    -- 2. CRIAR TEAM_MEMBER com user_id = id do profile e role = admin
    INSERT INTO public.team_members (user_id, auth_user_id, name, full_name, email, role)
    VALUES (NEW.id, NEW.id, v_name, v_name, NEW.email, 'admin'::user_role);

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
