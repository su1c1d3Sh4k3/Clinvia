-- =====================================================
-- Dashboard Performance: multi-tenancy + consolidated metrics + indexes
-- =====================================================
-- Problema original:
--   1. get_dashboard_history() não filtrava por user_id — scan global de
--      contacts e conversations (pesadíssimo em ambientes multi-tenant).
--   2. Frontend fazia 2 queries separadas para team_members + 1 RPC + 1 SELECT
--      para computar qualidade e tempo de resposta (4 round-trips).
--   3. Falta índice composto em conversations(user_id, created_at) — queries
--      de histórico sem filtro de status acabam em seq scan.
-- =====================================================

-- ─── 1. get_dashboard_history com multi-tenancy ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_dashboard_history()
RETURNS JSON AS $$
DECLARE
    result JSON;
    current_owner_id UUID;
BEGIN
    -- Resolver owner_id (mesma lógica de get_dashboard_stats / get_team_performance)
    SELECT tm.user_id INTO current_owner_id
    FROM public.team_members tm
    WHERE tm.auth_user_id = auth.uid()
    LIMIT 1;

    IF current_owner_id IS NULL THEN
        SELECT tm.user_id INTO current_owner_id
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
        LIMIT 1;
    END IF;

    IF current_owner_id IS NULL THEN
        current_owner_id := auth.uid();
    END IF;

    SELECT json_build_object(
        'daily_new_contacts', (
            SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.sort_key), '[]'::json)
            FROM (
                SELECT
                    to_char(date_trunc('day', created_at), 'DD/MM') AS date,
                    date_trunc('day', created_at) AS sort_key,
                    COUNT(id) AS value
                FROM public.contacts
                WHERE created_at > now() - interval '30 days'
                  AND user_id = current_owner_id
                GROUP BY 1, 2
            ) t
        ),
        'daily_new_tickets', (
            SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.sort_key), '[]'::json)
            FROM (
                SELECT
                    to_char(date_trunc('day', created_at), 'DD/MM') AS date,
                    date_trunc('day', created_at) AS sort_key,
                    COUNT(id) AS value
                FROM public.conversations
                WHERE created_at > now() - interval '30 days'
                  AND user_id = current_owner_id
                GROUP BY 1, 2
            ) t
        ),
        'monthly_combined', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                WITH months AS (
                    SELECT generate_series(
                        date_trunc('month', now() - interval '11 months'),
                        date_trunc('month', now()),
                        '1 month'::interval
                    ) AS month
                ),
                contact_agg AS (
                    SELECT date_trunc('month', created_at) AS month, COUNT(*) AS new_contacts
                    FROM public.contacts
                    WHERE user_id = current_owner_id
                      AND created_at > now() - interval '12 months'
                    GROUP BY 1
                ),
                conv_agg AS (
                    SELECT date_trunc('month', created_at) AS month, COUNT(*) AS new_tickets
                    FROM public.conversations
                    WHERE user_id = current_owner_id
                      AND created_at > now() - interval '12 months'
                    GROUP BY 1
                )
                SELECT
                    to_char(m.month, 'MM/YYYY') AS month,
                    COALESCE(c.new_contacts, 0) AS new_contacts,
                    COALESCE(v.new_tickets, 0) AS new_tickets
                FROM months m
                LEFT JOIN contact_agg c ON c.month = m.month
                LEFT JOIN conv_agg v ON v.month = m.month
                ORDER BY m.month
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 2. RPC consolidada: qualidade + tempo de resposta num só call ──────────

CREATE OR REPLACE FUNCTION public.get_dashboard_global_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
    current_owner_id UUID;
    avg_quality NUMERIC;
    avg_response_time_seconds NUMERIC;
BEGIN
    SELECT tm.user_id INTO current_owner_id
    FROM public.team_members tm
    WHERE tm.auth_user_id = auth.uid()
    LIMIT 1;

    IF current_owner_id IS NULL THEN
        SELECT tm.user_id INTO current_owner_id
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
        LIMIT 1;
    END IF;

    IF current_owner_id IS NULL THEN
        current_owner_id := auth.uid();
    END IF;

    -- Qualidade: média do sentiment_score das conversas do owner
    SELECT AVG(aa.sentiment_score)
    INTO avg_quality
    FROM public.ai_analysis aa
    JOIN public.conversations c ON aa.conversation_id = c.id
    WHERE c.user_id = current_owner_id
      AND aa.sentiment_score IS NOT NULL;

    -- Tempo de resposta: média em segundos, ignorando outliers > 24h
    SELECT AVG(rt.response_duration_seconds)
    INTO avg_response_time_seconds
    FROM public.response_times rt
    JOIN public.conversations c ON rt.conversation_id = c.id
    WHERE c.user_id = current_owner_id
      AND rt.response_duration_seconds IS NOT NULL
      AND rt.response_duration_seconds < 86400;

    result := json_build_object(
        'avg_quality', ROUND(COALESCE(avg_quality, 0)::numeric, 1),
        'avg_response_time_seconds', ROUND(COALESCE(avg_response_time_seconds, 0)::numeric, 0),
        'quality_change', 0,
        'response_time_change', 0
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 3. Índices adicionais ─────────────────────────────────────────────────

-- Para get_dashboard_history: filtra por user_id + range de created_at
CREATE INDEX IF NOT EXISTS idx_conversations_user_created
    ON public.conversations(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_contacts_user_created
    ON public.contacts(user_id, created_at);

-- Para get_dashboard_global_metrics e get_team_performance:
-- lookup rápido de ai_analysis / response_times por conversation_id
CREATE INDEX IF NOT EXISTS idx_ai_analysis_conversation_id
    ON public.ai_analysis(conversation_id);

CREATE INDEX IF NOT EXISTS idx_response_times_conversation_id
    ON public.response_times(conversation_id);

-- ─── 4. Grants (SECURITY DEFINER exige que usuários autenticados possam chamar) ─

GRANT EXECUTE ON FUNCTION public.get_dashboard_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_global_metrics() TO authenticated;
