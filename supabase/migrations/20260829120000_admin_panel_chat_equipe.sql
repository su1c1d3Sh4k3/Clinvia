-- Painel admin: chat de suporte (thread), equipe do admin e metricas do dashboard.

-- ============================================================
-- 1. Chat de suporte
-- ============================================================

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sender_type TEXT,
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client','support')),
  sender_auth_user_id UUID,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  file_name TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg ON public.support_tickets(last_message_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.support_message_touch_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET last_message_at  = NEW.created_at,
         last_sender_type = NEW.sender_type,
         status = CASE
                    WHEN NEW.sender_type = 'client' AND status = 'resolved' THEN 'open'
                    ELSE status
                  END,
         updated_at = NOW()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_message_touch_ticket ON public.support_messages;
CREATE TRIGGER trg_support_message_touch_ticket
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.support_message_touch_ticket();

-- ============================================================
-- 2. Equipe do admin
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_auth ON public.admin_users(auth_user_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid() AND p.role = 'super-admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.admin_users a
     WHERE a.auth_user_id = auth.uid() AND a.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_can(p_page TEXT, p_level TEXT DEFAULT 'view')
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level TEXT;
BEGIN
  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(a.permissions ->> p_page, 'none') INTO v_level
    FROM public.admin_users a
   WHERE a.auth_user_id = auth.uid() AND a.is_active
   LIMIT 1;

  IF v_level IS NULL OR v_level = 'none' THEN
    RETURN FALSE;
  END IF;

  IF p_level = 'edit' THEN
    RETURN v_level = 'edit';
  END IF;

  RETURN v_level IN ('view','edit');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_service_role ON public.support_messages;
CREATE POLICY support_messages_service_role ON public.support_messages
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS support_messages_client_select ON public.support_messages;
CREATE POLICY support_messages_client_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_messages.ticket_id
         AND (t.user_id = public.get_owner_id() OR t.auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS support_messages_client_insert ON public.support_messages;
CREATE POLICY support_messages_client_insert ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_messages.ticket_id
         AND (t.user_id = public.get_owner_id() OR t.auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS support_messages_staff_select ON public.support_messages;
CREATE POLICY support_messages_staff_select ON public.support_messages
  FOR SELECT TO authenticated USING (public.is_admin_staff());

DROP POLICY IF EXISTS support_messages_staff_insert ON public.support_messages;
CREATE POLICY support_messages_staff_insert ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_staff() AND sender_type = 'support');

DROP POLICY IF EXISTS support_messages_staff_update ON public.support_messages;
CREATE POLICY support_messages_staff_update ON public.support_messages
  FOR UPDATE TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

-- support_tickets: cliente passa a poder ABRIR chamado (antes so a Bia via service role)
DROP POLICY IF EXISTS support_tickets_client_insert ON public.support_tickets;
CREATE POLICY support_tickets_client_insert ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_owner_id() AND auth_user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_staff_all ON public.support_tickets;
CREATE POLICY support_tickets_staff_all ON public.support_tickets
  FOR ALL TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

-- admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_service_role ON public.admin_users;
CREATE POLICY admin_users_service_role ON public.admin_users
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS admin_users_self_select ON public.admin_users;
CREATE POLICY admin_users_self_select ON public.admin_users
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS admin_users_super_write ON public.admin_users;
CREATE POLICY admin_users_super_write ON public.admin_users
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Infra (dev-manager) passa a aceitar a equipe do admin, nao so o super-admin
DROP POLICY IF EXISTS super_admin_infra_metrics ON public.infra_metrics;
CREATE POLICY admin_staff_infra_metrics ON public.infra_metrics
  FOR ALL TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

DROP POLICY IF EXISTS super_admin_system_config ON public.system_config;
CREATE POLICY admin_staff_system_config ON public.system_config
  FOR ALL TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

DROP POLICY IF EXISTS super_admin_alert_log ON public.alert_log;
CREATE POLICY admin_staff_alert_log ON public.alert_log
  FOR ALL TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

-- ============================================================
-- 4. Realtime
-- ============================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
