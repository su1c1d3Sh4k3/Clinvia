-- Verificacao em duas etapas do painel administrativo.
--
-- Depois de acertar e-mail + senha em /admin-oath, o acesso ao /admin so e
-- liberado com um codigo de 6 caracteres (letras e numeros) enviado por e-mail.
--
-- O codigo NUNCA trafega para o navegador: a tabela admin_login_codes guarda
-- apenas o SHA-256 e e legivel somente pelo service_role (edge fn admin-2fa).
-- Quem confere o codigo escreve uma linha em admin_2fa_verifications; e essa
-- linha que o guard do painel le (via RPC) para liberar a tela.

-- ============================================================
-- 1. E-mail que recebe o codigo por usuario do painel
-- ============================================================

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS two_factor_email TEXT;

COMMENT ON COLUMN public.admin_users.two_factor_email IS
  'E-mail que recebe o codigo de 2 etapas. NULL = usa a lista padrao da edge fn admin-2fa.';

-- ============================================================
-- 2. Codigos emitidos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  sent_to TEXT[] NOT NULL DEFAULT '{}',
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_codes_pending
  ON public.admin_login_codes(auth_user_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.admin_login_codes ENABLE ROW LEVEL SECURITY;

-- Sem policy para authenticated de proposito: nem o dono do codigo pode le-lo.
DROP POLICY IF EXISTS admin_login_codes_service_role ON public.admin_login_codes;
CREATE POLICY admin_login_codes_service_role ON public.admin_login_codes
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 3. Sessoes que ja passaram pelo codigo
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_2fa_verifications (
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (auth_user_id, session_id)
);

ALTER TABLE public.admin_2fa_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_2fa_verifications_service_role ON public.admin_2fa_verifications;
CREATE POLICY admin_2fa_verifications_service_role ON public.admin_2fa_verifications
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- O usuario pode apagar a PROPRIA verificacao (logout), mas nunca criar uma:
-- so a edge fn admin-2fa (service_role) escreve aqui.
DROP POLICY IF EXISTS admin_2fa_verifications_self_delete ON public.admin_2fa_verifications;
CREATE POLICY admin_2fa_verifications_self_delete ON public.admin_2fa_verifications
  FOR DELETE TO authenticated USING (auth_user_id = auth.uid());

-- ============================================================
-- 4. RPCs do guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_2fa_is_verified(p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_2fa_verifications v
     WHERE v.auth_user_id = auth.uid()
       AND v.session_id = p_session_id
       AND v.verified_at > NOW() - INTERVAL '12 hours'
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_2fa_clear(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_2fa_verifications
   WHERE auth_user_id = auth.uid()
     AND session_id = p_session_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_2fa_is_verified(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_2fa_clear(TEXT) TO authenticated;
