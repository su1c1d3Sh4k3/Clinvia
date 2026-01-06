-- =============================================
-- FIX: Corrigir trigger de signup para seguir regras corretas
-- Data: 2026-01-05
-- =============================================
-- REGRAS:
-- 1. Cadastro self-service: Cria profiles + team_members (user_id = auth_user_id = NEW.id, role = admin)
-- 2. Criado por admin: Cria APENAS team_members (user_id = owner_id, auth_user_id = NEW.id, role = escolhido)
-- =============================================

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
    -- Se é membro criado por admin via Edge Function, não faz nada
    -- A Edge Function já criou o registro em team_members manualmente
    IF (NEW.raw_user_meta_data->>'is_team_member') = 'true' THEN
        RETURN NEW;
    END IF;

    -- Extrair nome do usuário
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name', 
        split_part(NEW.email, '@', 1)
    );

    -- 1. Criar profile (APENAS para cadastros self-service)
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (NEW.id, v_name, NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Criar team_member como admin
    -- Para admins self-service: user_id = auth_user_id = NEW.id (owner de si mesmo)
    INSERT INTO public.team_members (user_id, auth_user_id, name, full_name, email, role)
    VALUES (NEW.id, NEW.id, v_name, v_name, NEW.email, 'admin'::user_role)
    ON CONFLICT (auth_user_id) DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        email = EXCLUDED.email;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log de erro mas não falha o signup
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recriar trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Log de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Trigger handle_new_user recriado com sucesso';
END $$;
