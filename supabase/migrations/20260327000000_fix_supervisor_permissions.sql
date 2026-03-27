-- ============================================================
-- Fix: Permissões completas para Supervisores
-- 
-- Problemas corrigidos:
--   1. is_supervisor() e is_agent() usavam user_id = auth.uid()
--      mas para membros de equipe user_id = admin_id, não o próprio ID
--      => Agora usam auth_user_id = auth.uid()
--   2. Supervisores devem ter acesso igual ao admin, exceto DELETE
-- ============================================================

-- 1. Corrigir is_supervisor() para usar auth_user_id
CREATE OR REPLACE FUNCTION is_supervisor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
    AND role = 'supervisor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Corrigir is_agent() para usar auth_user_id
CREATE OR REPLACE FUNCTION is_agent()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
    AND role = 'agent'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Corrigir is_admin() para garantir compatibilidade com auth_user_id
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Garantir que auth_user_id está preenchido para membros existentes
-- Para membros onde auth_user_id é NULL mas possuem user_id próprio
-- (criados antes da coluna existir) — não podemos saber o auth_user_id 
-- sem o login deles, então esse fix aplica apenas onde podemos deduzir

-- Para admins: auth_user_id = user_id (mesmo ID)
UPDATE public.team_members
SET auth_user_id = user_id
WHERE role = 'admin' AND auth_user_id IS NULL;

