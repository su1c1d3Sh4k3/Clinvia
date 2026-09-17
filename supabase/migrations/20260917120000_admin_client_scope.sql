-- ============================================================
-- Escopo de contas para usuarios do painel admin
--
-- Regras (definidas pelo super-admin):
--  * usuario do painel com acesso a pagina "clientes" NUNCA ve
--    cadastros pendentes nem clientes inativos (exclusivo super-admin)
--  * nivel "view" = so consulta; "edit" libera desativar/reativar
--  * excluir conta continua exclusivo do super-admin
--  * cada usuario tem uma lista de contas permitidas (default: nenhuma)
--  * nenhum usuario do painel pode alcancar um perfil super-admin
-- ============================================================

-- ============================================================
-- 1. Colunas de escopo
-- ============================================================

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS client_scope TEXT NOT NULL DEFAULT 'selected',
  ADD COLUMN IF NOT EXISTS allowed_client_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.admin_users'::regclass
       AND conname = 'admin_users_client_scope_check'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_client_scope_check
      CHECK (client_scope IN ('all','selected'));
  END IF;
END $$;

-- ============================================================
-- 2. Helpers de escopo (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_client_scope_all()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.admin_users a
     WHERE a.auth_user_id = auth.uid()
       AND a.is_active
       AND a.client_scope = 'all'
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_allowed_client_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT a.allowed_client_ids FROM public.admin_users a
      WHERE a.auth_user_id = auth.uid() AND a.is_active
      LIMIT 1),
    '{}'::uuid[]
  );
$$;

-- Porta unica de acesso a UMA conta de cliente pelo painel.
CREATE OR REPLACE FUNCTION public.admin_can_access_client(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- precisa de permissao na pagina de clientes
  IF NOT public.admin_can('clientes', 'view') THEN
    RETURN FALSE;
  END IF;

  -- barreira dura: ninguem alem do super-admin alcanca um perfil super-admin
  SELECT p.role INTO v_target_role FROM public.profiles p WHERE p.id = p_profile_id;
  IF v_target_role IS NULL OR v_target_role = 'super-admin' THEN
    RETURN FALSE;
  END IF;

  IF public.admin_client_scope_all() THEN
    RETURN TRUE;
  END IF;

  RETURN p_profile_id = ANY (public.admin_allowed_client_ids());
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_client_scope_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_allowed_client_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can_access_client(UUID) TO authenticated;

-- ============================================================
-- 3. Listagem de clientes ativos com escopo
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_all_profiles(
  p_search TEXT DEFAULT ''::text,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id uuid, full_name text, company_name text, email text, phone text,
  instagram text, address text, role text, status text,
  deactivated_at timestamptz, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_super BOOLEAN := public.is_super_admin();
  v_scope_all BOOLEAN;
  v_allowed UUID[];
BEGIN
  IF NOT v_super AND NOT public.admin_can('clientes', 'view') THEN
    RAISE EXCEPTION 'Access denied: clientes permission required';
  END IF;

  v_scope_all := v_super OR public.admin_client_scope_all();
  v_allowed := public.admin_allowed_client_ids();

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.company_name, p.email, p.phone, p.instagram,
    p.address, p.role, p.status, p.deactivated_at, p.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  WHERE
    (p.status = 'ativo' OR p.status IS NULL)
    AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
    AND (v_scope_all OR p.id = ANY (v_allowed))
    AND (
      p_search = '' OR
      p.full_name ILIKE '%' || p_search || '%' OR
      p.company_name ILIKE '%' || p_search || '%' OR
      p.email ILIKE '%' || p_search || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Opcoes para o seletor de contas do modal de usuarios do painel.
CREATE OR REPLACE FUNCTION public.admin_list_client_options()
RETURNS TABLE(id uuid, company_name text, full_name text, email text, deactivated boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super-admin role required';
  END IF;

  RETURN QUERY
  SELECT p.id,
         COALESCE(p.company_name, p.full_name, p.email) AS company_name,
         p.full_name,
         p.email,
         (p.deactivated_at IS NOT NULL) AS deactivated
    FROM public.profiles p
   WHERE p.role IS DISTINCT FROM 'super-admin'
   ORDER BY COALESCE(p.company_name, p.full_name, p.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_client_options() TO authenticated;

-- ============================================================
-- 4. Desativar / reativar: exige "edit" + conta no escopo
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_deactivate_profile(p_profile_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    IF NOT public.admin_can('clientes', 'edit') THEN
      RAISE EXCEPTION 'Access denied: clientes edit permission required';
    END IF;
    IF NOT public.admin_can_access_client(p_profile_id) THEN
      RAISE EXCEPTION 'Access denied: account out of scope';
    END IF;
  END IF;

  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate your own admin account';
  END IF;

  UPDATE public.profiles
     SET deactivated_at = now(), updated_at = now()
   WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN json_build_object('success', true, 'deactivated_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_profile(p_profile_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    IF NOT public.admin_can('clientes', 'edit') THEN
      RAISE EXCEPTION 'Access denied: clientes edit permission required';
    END IF;
    IF NOT public.admin_can_access_client(p_profile_id) THEN
      RAISE EXCEPTION 'Access denied: account out of scope';
    END IF;
  END IF;

  UPDATE public.profiles
     SET deactivated_at = NULL, updated_at = now()
   WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- 5. Detalhes da conta: guard unico por admin_can_access_client
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_team_members_with_tokens(p_user_id UUID)
RETURNS TABLE(
  id uuid, name text, role text, email text, phone text,
  tokens_total bigint, approximate_cost_total numeric, audio_cost_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can_access_client(p_user_id) THEN
    RAISE EXCEPTION 'Access denied: account out of scope';
  END IF;

  RETURN QUERY
  SELECT
    tm.id, tm.name, tm.role, tm.email, tm.phone,
    COALESCE(tm.tokens_total, 0)::BIGINT,
    COALESCE(tm.approximate_cost_total, 0)::DECIMAL,
    COALESCE(tm.audio_cost_total, 0)::DECIMAL
  FROM public.team_members tm
  WHERE tm.user_id = p_user_id
  ORDER BY (COALESCE(tm.approximate_cost_total, 0) + COALESCE(tm.audio_cost_total, 0)) DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_professionals(p_user_id UUID)
RETURNS TABLE(id uuid, name text, role text, photo_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can_access_client(p_user_id) THEN
    RAISE EXCEPTION 'Access denied: account out of scope';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.name, r.role, r.photo_url
    FROM public.professionals pr
    LEFT JOIN public.responsaveis r ON r.id = pr.responsavel_id
   WHERE pr.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_appointment_stats(p_user_id UUID)
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can_access_client(p_user_id) THEN
    RAISE EXCEPTION 'Access denied: account out of scope';
  END IF;

  RETURN QUERY
  SELECT a.status, COUNT(*)
    FROM public.appointments a
   WHERE a.user_id = p_user_id
   GROUP BY a.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_conversation_stats(p_user_id UUID)
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can_access_client(p_user_id) THEN
    RAISE EXCEPTION 'Access denied: account out of scope';
  END IF;

  RETURN QUERY
  SELECT c.status, COUNT(*)
    FROM public.conversations c
   WHERE c.user_id = p_user_id
   GROUP BY c.status;
END;
$$;

-- ============================================================
-- 6. Dashboard: pendentes/inativos e listas nominais so p/ super-admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC := COALESCE(public.latest_usd_brl_rate(), 5.50);
  v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_today_start TIMESTAMPTZ := (v_today::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_month_start TIMESTAMPTZ := (date_trunc('month', v_today)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_super BOOLEAN := public.is_super_admin();
  v_scope_all BOOLEAN;
  v_allowed UUID[];
  v_result JSONB;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_scope_all := v_super OR public.admin_client_scope_all();
  v_allowed := public.admin_allowed_client_ids();

  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'exchange_rate', v_rate,
    'is_super_admin', v_super,

    'clients', (
      SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE p.role IN ('admin','agent','supervisor') AND p.deactivated_at IS NULL),
        'new_this_month', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL AND p.created_at >= v_month_start),
        'deactivated', CASE WHEN v_super THEN COUNT(*) FILTER (WHERE p.deactivated_at IS NOT NULL) ELSE NULL END,
        'active_admins', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL)
      ) FROM public.profiles p
    ),

    'pending_signups', (
      CASE WHEN v_super
        THEN (SELECT COUNT(*) FROM public.pending_signups WHERE status = 'pending')
        ELSE NULL END
    ),

    'deactivated_list', (
      CASE WHEN v_super THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'company_name', p.company_name, 'full_name', p.full_name,
          'deactivated_at', p.deactivated_at,
          'days_remaining', GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - p.deactivated_at)::int)
        ) ORDER BY p.deactivated_at), '[]'::jsonb)
        FROM public.profiles p WHERE p.deactivated_at IS NOT NULL
      ) ELSE '[]'::jsonb END
    ),

    'tokens', (
      SELECT jsonb_build_object(
        'today_tokens', COALESCE(SUM(t.total_tokens) FILTER (WHERE t.created_at >= v_today_start), 0),
        'today_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)) FILTER (WHERE t.created_at >= v_today_start), 0)::numeric, 2),
        'month_tokens', COALESCE(SUM(t.total_tokens), 0),
        'month_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)), 0)::numeric, 2)
      ) FROM public.token_usage_log t WHERE t.created_at >= v_month_start
    ),

    'templates', (
      SELECT jsonb_build_object(
        'today_count', COUNT(*) FILTER (WHERE s.created_at >= v_today_start),
        'today_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)) FILTER (WHERE s.created_at >= v_today_start), 0) * v_rate, 2),
        'month_count', COUNT(*),
        'month_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)), 0) * v_rate, 2)
      ) FROM public.template_sends s WHERE s.created_at >= v_month_start
    ),

    'instances', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE i.status = 'connected'),
        'disconnected', COUNT(*) FILTER (WHERE i.status IS DISTINCT FROM 'connected'),
        'meta', COUNT(*) FILTER (WHERE i.provider = 'meta'),
        'restricted', COUNT(*) FILTER (WHERE i.restriction_active)
      ) FROM public.instances i
    ),

    'instagram', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE g.status = 'connected'),
        'expiring', COUNT(*) FILTER (WHERE g.token_expires_at IS NOT NULL AND g.token_expires_at < NOW() + INTERVAL '7 days')
      ) FROM public.instagram_instances g
    ),

    'health', (
      SELECT jsonb_build_object(
        'queue_pending', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'pending'),
        'queue_processing', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'processing'),
        'queue_failed', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'),
        'alerts_open', (SELECT COUNT(*) FROM public.alert_log WHERE NOT resolved),
        'tickets_open', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved'),
        'tickets_urgent', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND priority = 'urgent'),
        'tickets_waiting', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND last_sender_type = 'client')
      )
    ),

    'usage', (
      SELECT jsonb_build_object(
        'messages_in', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'inbound'),
        'messages_out', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'outbound'),
        'conversations_active', (SELECT COUNT(*) FROM public.conversations WHERE status IN ('open','pending')),
        'campaigns_dispatching', (SELECT COUNT(*) FROM public.campaigns WHERE status = 'dispatching'),
        'appointments_today', (SELECT COUNT(*) FROM public.appointments WHERE created_at >= v_today_start)
      )
    ),

    'top_cost', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.id, COALESCE(p.company_name, p.full_name, p.email) AS company_name,
               ROUND(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate))::numeric, 2) AS cost_brl,
               SUM(t.total_tokens) AS tokens
          FROM public.token_usage_log t
          JOIN public.profiles p ON p.id = t.owner_id
         WHERE t.created_at >= NOW() - INTERVAL '30 days'
           AND (v_scope_all OR p.id = ANY (v_allowed))
           AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
         GROUP BY p.id, p.company_name, p.full_name, p.email
         ORDER BY 3 DESC
         LIMIT 10
      ) x
    ),

    'risk', (
      SELECT jsonb_build_object(
        'invalid_openai', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'company_name', COALESCE(p.company_name, p.full_name))), '[]'::jsonb)
            FROM public.profiles p
           WHERE p.openai_token_invalid IS TRUE AND p.deactivated_at IS NULL
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
        ),
        'restricted_instances', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'type', i.restriction_type,
            'company_name', COALESCE(p.company_name, p.full_name)
          )), '[]'::jsonb)
            FROM public.instances i LEFT JOIN public.profiles p ON p.id = i.user_id
           WHERE i.restriction_active
             AND (v_scope_all OR i.user_id = ANY (v_allowed))
        ),
        'idle_tenants', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', p.id, 'company_name', COALESCE(p.company_name, p.full_name), 'last_message_at', lm.last_at
          ) ORDER BY lm.last_at NULLS FIRST), '[]'::jsonb)
            FROM public.profiles p
            LEFT JOIN LATERAL (
              SELECT MAX(c.last_message_at) AS last_at
                FROM public.conversations c WHERE c.user_id = p.id
            ) lm ON TRUE
           WHERE p.role = 'admin' AND p.deactivated_at IS NULL
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (lm.last_at IS NULL OR lm.last_at < NOW() - INTERVAL '7 days')
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_metrics() TO authenticated;
