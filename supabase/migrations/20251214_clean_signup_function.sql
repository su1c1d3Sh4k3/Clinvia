-- =============================================
-- FUNÇÃO SIMPLES COM LOGS
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
    -- Log início
    RAISE LOG 'handle_new_user: Iniciando para user_id=%', NEW.id;
    
    -- Se é membro de equipe criado pelo admin, não fazer nada
    IF (NEW.raw_user_meta_data->>'is_team_member') = 'true' THEN
        RAISE LOG 'handle_new_user: É team_member, ignorando';
        RETURN NEW;
    END IF;

    -- Nome
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    RAISE LOG 'handle_new_user: Nome=%', v_name;

    -- Criar profile
    RAISE LOG 'handle_new_user: Criando profile...';
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, v_name);
    RAISE LOG 'handle_new_user: Profile criado';

    -- Criar team_member
    RAISE LOG 'handle_new_user: Criando team_member...';
    INSERT INTO public.team_members (user_id, name, email, role)
    VALUES (NEW.id, v_name, NEW.email, 'admin');
    RAISE LOG 'handle_new_user: Team_member criado';

    RAISE LOG 'handle_new_user: Concluído com sucesso';
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user ERRO: % - %', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
