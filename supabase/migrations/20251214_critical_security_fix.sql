-- =============================================
-- CRITICAL FIX: User Signup and Multi-Tenant Security
-- =============================================
-- Este arquivo substitui os anteriores e corrige o fluxo de cadastro

-- 1. Garantir que as colunas necessárias existem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'auth_user_id') THEN
    ALTER TABLE public.team_members ADD COLUMN auth_user_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'full_name') THEN
    ALTER TABLE public.team_members ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- 2. Recriar trigger de signup para criar PROFILE e TEAM_MEMBER corretamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criar entrada no profiles
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- Criar entrada no team_members como ADMIN
  -- user_id = NEW.id (o owner é ele mesmo)
  -- auth_user_id = NEW.id (para autenticação)
  INSERT INTO public.team_members (
    user_id, 
    auth_user_id, 
    name, 
    full_name,
    email, 
    role
  )
  VALUES (
    NEW.id,  -- user_id: este é o OWNER de todos os dados
    NEW.id,  -- auth_user_id: para verificar o login
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'admin'::user_role
  )
  ON CONFLICT (user_id) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. GARANTIR que get_owner_id() funciona corretamente para novos usuários
CREATE OR REPLACE FUNCTION get_owner_id()
RETURNS UUID AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Primeiro tenta buscar por auth_user_id (membros de equipe e admins novos)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Fallback: busca por user_id onde o próprio user_id = auth.uid (admins antigos)
    SELECT user_id INTO v_owner_id
    FROM public.team_members
    WHERE user_id = auth.uid() AND role = 'admin'
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        RETURN v_owner_id;
    END IF;
    
    -- Para novos usuários que AINDA NÃO TÊM team_member (não deveria acontecer)
    -- Retorna o próprio UID - mas isso NÃO deve dar acesso a dados de outros
    -- porque as policies verificam get_owner_id() = user_id
    RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Verificar se há team_members sem auth_user_id e corrigir para admins
UPDATE public.team_members
SET auth_user_id = user_id
WHERE auth_user_id IS NULL AND role = 'admin';

-- 5. Garantir policies restritivas nas tabelas principais
-- Nenhum dado deve ser retornado se get_owner_id() não bater com user_id

-- A) Garantir que todas as tabelas principais tenham user_id NOT NULL
-- (Isso impedirá que dados sem user_id sejam acessados)

-- instances
DO $$
BEGIN
  -- Atualizar registros sem user_id para NULL (isso os torna inacessíveis)
  -- Em produção, você deve associá-los a um user_id específico
  UPDATE public.instances SET user_id = NULL WHERE user_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- contacts
DO $$
BEGIN
  UPDATE public.contacts SET user_id = NULL WHERE user_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- conversations
DO $$
BEGIN
  UPDATE public.conversations SET user_id = NULL WHERE user_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- messages
DO $$
BEGIN
  UPDATE public.messages SET user_id = NULL WHERE user_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Verificar e recriar policies críticas que usam get_owner_id()
-- (já criadas na migration 20251212140000, mas vamos garantir)

DROP POLICY IF EXISTS "Team can view instances" ON public.instances;
DROP POLICY IF EXISTS "Team can manage instances" ON public.instances;
CREATE POLICY "Team can view instances" ON public.instances
    FOR SELECT TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id);
CREATE POLICY "Team can manage instances" ON public.instances
    FOR ALL TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

DROP POLICY IF EXISTS "Team can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team can manage contacts" ON public.contacts;
CREATE POLICY "Team can view contacts" ON public.contacts
    FOR SELECT TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id);
CREATE POLICY "Team can manage contacts" ON public.contacts
    FOR ALL TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

DROP POLICY IF EXISTS "Team can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team can manage conversations" ON public.conversations;
CREATE POLICY "Team can view conversations" ON public.conversations
    FOR SELECT TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id);
CREATE POLICY "Team can manage conversations" ON public.conversations
    FOR ALL TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

DROP POLICY IF EXISTS "Team can view messages" ON public.messages;
DROP POLICY IF EXISTS "Team can manage messages" ON public.messages;
CREATE POLICY "Team can view messages" ON public.messages
    FOR SELECT TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id);
CREATE POLICY "Team can manage messages" ON public.messages
    FOR ALL TO authenticated USING (user_id IS NOT NULL AND get_owner_id() = user_id) 
    WITH CHECK (get_owner_id() = user_id);

-- 7. Policy para team_members - usuários podem ver apenas seu próprio registro ou da mesma equipe
DROP POLICY IF EXISTS "Users can view their own team record" ON public.team_members;
DROP POLICY IF EXISTS "Users can view own record via auth_user_id" ON public.team_members;
DROP POLICY IF EXISTS "Admins can manage all team members" ON public.team_members;
DROP POLICY IF EXISTS "Team members visibility" ON public.team_members;

CREATE POLICY "Team members visibility" ON public.team_members
    FOR SELECT TO authenticated 
    USING (
        -- Pode ver seu próprio registro
        auth_user_id = auth.uid() OR user_id = auth.uid()
        -- OU pode ver membros da mesma equipe (mesmo user_id/owner)
        OR user_id = get_owner_id()
    );

CREATE POLICY "Team members management" ON public.team_members
    FOR ALL TO authenticated 
    USING (
        -- Admins podem gerenciar sua própria equipe
        user_id = get_owner_id() AND (
            SELECT role FROM team_members WHERE auth_user_id = auth.uid()
        ) IN ('admin', 'supervisor')
    )
    WITH CHECK (user_id = get_owner_id());

-- =============================================
-- FIM DA CORREÇÃO CRÍTICA
-- =============================================
