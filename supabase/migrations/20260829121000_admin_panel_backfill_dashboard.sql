-- Backfill dos tickets antigos como 1a mensagem da thread + RPC de metricas do dashboard admin.

-- ============================================================
-- 1. Backfill (statements separados, nunca CTE encadeada)
-- ============================================================

INSERT INTO public.support_messages (ticket_id, sender_type, sender_auth_user_id, sender_name, body, created_at)
SELECT t.id, 'client', t.auth_user_id, t.creator_name,
       COALESCE(NULLIF(t.client_summary, ''), t.description),
       t.created_at
  FROM public.support_tickets t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'client'
 );

INSERT INTO public.support_messages (ticket_id, sender_type, sender_name, body, created_at)
SELECT t.id, 'support', 'Suporte Clinvia', t.support_response, COALESCE(t.updated_at, t.created_at)
  FROM public.support_tickets t
 WHERE t.support_response IS NOT NULL
   AND btrim(t.support_response) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'support'
   );

UPDATE public.support_tickets t
   SET last_message_at = m.max_at,
       last_sender_type = m.last_type
  FROM (
    SELECT DISTINCT ON (ticket_id) ticket_id, created_at AS max_at, sender_type AS last_type
      FROM public.support_messages
     ORDER BY ticket_id, created_at DESC
  ) m
 WHERE m.ticket_id = t.id AND t.last_message_at IS NULL;

-- ============================================================
-- 2. RPC de metricas do dashboard
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
  v_result JSONB;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'exchange_rate', v_rate,

    'clients', (
      SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE p.role IN ('admin','agent','supervisor') AND p.deactivated_at IS NULL),
        'new_this_month', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL AND p.created_at >= v_month_start),
        'deactivated', COUNT(*) FILTER (WHERE p.deactivated_at IS NOT NULL),
        'active_admins', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL)
      ) FROM public.profiles p
    ),

    'pending_signups', (
      SELECT COUNT(*) FROM public.pending_signups WHERE status = 'pending'
    ),

    'deactivated_list', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'company_name', p.company_name, 'full_name', p.full_name,
        'deactivated_at', p.deactivated_at,
        'days_remaining', GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - p.deactivated_at)::int)
      ) ORDER BY p.deactivated_at), '[]'::jsonb)
      FROM public.profiles p WHERE p.deactivated_at IS NOT NULL
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
         GROUP BY p.id, p.company_name, p.full_name, p.email
         ORDER BY 3 DESC
         LIMIT 10
      ) x
    ),

    'risk', (
      SELECT jsonb_build_object(
        'invalid_openai', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'company_name', COALESCE(p.company_name, p.full_name))), '[]'::jsonb)
            FROM public.profiles p WHERE p.openai_token_invalid IS TRUE AND p.deactivated_at IS NULL
        ),
        'restricted_instances', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'type', i.restriction_type,
            'company_name', COALESCE(p.company_name, p.full_name)
          )), '[]'::jsonb)
            FROM public.instances i LEFT JOIN public.profiles p ON p.id = i.user_id
           WHERE i.restriction_active
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
             AND (lm.last_at IS NULL OR lm.last_at < NOW() - INTERVAL '7 days')
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_metrics() TO authenticated;
