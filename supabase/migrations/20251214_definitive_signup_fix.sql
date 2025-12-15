-- =============================================
-- SOLUÇÃO DEFINITIVA: Corrige signup de novos usuários
-- =============================================

-- 1. Garantir que auth_user_id e full_name existem
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Dropar trigger existente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Criar função SIMPLES que não falha
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Nome do usuário
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name', 
    split_part(NEW.email, '@', 1)
  );

  -- 1) Criar profile
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, v_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  -- 2) Verificar se já existe team_member para este user_id
  SELECT EXISTS(SELECT 1 FROM public.team_members WHERE user_id = NEW.id) INTO v_exists;
  
  -- 3) Se não existe, criar
  IF NOT v_exists THEN
    INSERT INTO public.team_members (user_id, auth_user_id, name, full_name, email, role)
    VALUES (NEW.id, NEW.id, v_name, v_name, NEW.email, 'admin'::user_role);
  ELSE
    -- Atualizar auth_user_id se o registro já existe
    UPDATE public.team_members 
    SET auth_user_id = NEW.id, email = NEW.email
    WHERE user_id = NEW.id AND auth_user_id IS NULL;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log do erro mas não falha o signup
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Recriar trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Garantir que admins existentes tenham auth_user_id
UPDATE public.team_members
SET auth_user_id = user_id
WHERE auth_user_id IS NULL AND role = 'admin';

-- 6. Atualizar get_owner_id para ser mais robusto
CREATE OR REPLACE FUNCTION get_owner_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Buscar por auth_user_id
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Buscar por user_id (admins onde user_id = auth.uid)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Fallback: retorna auth.uid (não dará acesso a dados de outros)
    RETURN auth.uid();
END;
$$;
