-- NPS por profissional: nota do feedback_24h atribuída ao profissional do agendamento
-- + colunas Aplicação/Profissional nas últimas avaliações da aba Satisfação

-- 1) RPC: média NPS por profissional (fonte: appointment_confirmation_sessions
--    flow feedback_24h → appointment_ids → appointments.professional_id).
--    p_start/p_end filtram pelo start_time do agendamento; NULL = todo o período.
CREATE OR REPLACE FUNCTION get_professional_nps(
    p_owner UUID,
    p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    professional_id UUID,
    professional_name TEXT,
    avg_nps NUMERIC,
    nps_count BIGINT
) AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND get_owner_id() IS DISTINCT FROM p_owner THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    RETURN QUERY
    WITH ratings AS (
        SELECT DISTINCT s.id AS session_id, a.professional_id AS prof_id,
               right(s.selected_rating, 1)::numeric AS nota
        FROM appointment_confirmation_sessions s
        CROSS JOIN unnest(s.appointment_ids) aid
        JOIN appointments a ON a.id = aid
        WHERE s.user_id = p_owner
          AND s.flow_type = 'feedback_24h'
          AND s.selected_rating ~ '[1-5]$'
          AND a.professional_id IS NOT NULL
          AND (p_start IS NULL OR a.start_time >= p_start)
          AND (p_end IS NULL OR a.start_time < p_end)
    )
    SELECT r.prof_id, p.name, ROUND(AVG(r.nota), 1), COUNT(*)
    FROM ratings r
    JOIN professionals p ON p.id = r.prof_id
    GROUP BY r.prof_id, p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_professional_nps TO authenticated;
GRANT EXECUTE ON FUNCTION get_professional_nps TO service_role;

-- 2) get_satisfaction_dashboard: last_reviews ganha 'professional' e 'application'
--    (via sessão feedback_24h da mesma conversa da entrada NPS)
CREATE OR REPLACE FUNCTION get_satisfaction_dashboard(
    p_owner UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS JSONB AS $$
DECLARE
    v_cards JSONB;
    v_reviews JSONB;
    v_agents JSONB;
    v_templates JSONB;
BEGIN
    -- Guarda multi-tenant (service_role passa: auth.uid() nulo)
    IF auth.uid() IS NOT NULL AND get_owner_id() IS DISTINCT FROM p_owner THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    -- ---------- Cards gerais ----------
    WITH nps_entries AS (
        SELECT nps_nota_to_number(e->>'nota') AS nota
        FROM contacts ct, jsonb_array_elements(ct.nps) e
        WHERE ct.user_id = p_owner AND ct.nps IS NOT NULL
          AND (e->>'dataPesquisa')::timestamptz >= p_start
          AND (e->>'dataPesquisa')::timestamptz < p_end
    ), sentiment AS (
        SELECT AVG(sentiment_score) AS avg_sent
        FROM conversations
        WHERE user_id = p_owner AND group_id IS NULL
          AND sentiment_score IS NOT NULL
          AND created_at >= p_start AND created_at < p_end
    )
    SELECT jsonb_build_object(
        'avg_sentiment', ROUND((SELECT avg_sent FROM sentiment)::numeric, 1),
        'avg_nps', ROUND(AVG(nota)::numeric, 1),
        'nps_count', COUNT(*)
    ) INTO v_cards
    FROM nps_entries WHERE nota IS NOT NULL;

    -- ---------- Últimas 10 avaliações NPS ----------
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'data' DESC), '[]'::jsonb) INTO v_reviews
    FROM (
        SELECT jsonb_build_object(
            'contact_name', ct.push_name,
            'phone', split_part(ct.number, '@', 1),
            'data', (e->>'dataPesquisa')::timestamptz,
            'nota', nps_nota_to_number(e->>'nota'),
            'feedback', e->>'feedback',
            'attended_by', CASE
                WHEN c.id IS NULL THEN NULL
                WHEN c.assigned_agent_id IS NOT NULL THEN tm.name
                WHEN c.is_ai_handled THEN 'IA'
            END,
            'is_ai', (c.assigned_agent_id IS NULL AND c.is_ai_handled),
            'duration_seconds', EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)),
            'sentiment', c.sentiment_score,
            'professional', ap.professional,
            'application', ap.application
        ) AS r
        FROM contacts ct
        CROSS JOIN jsonb_array_elements(ct.nps) e
        LEFT JOIN conversations c ON c.id = NULLIF(e->>'conversation_id', '')::uuid
        LEFT JOIN team_members tm ON tm.id = c.assigned_agent_id AND tm.user_id = p_owner
        LEFT JOIN LATERAL (
            SELECT string_agg(DISTINCT pr.name, ', ') AS professional,
                   string_agg(DISTINCT a.service_name, ', ') AS application
            FROM appointment_confirmation_sessions s
            CROSS JOIN unnest(s.appointment_ids) aid
            JOIN appointments a ON a.id = aid
            LEFT JOIN professionals pr ON pr.id = a.professional_id
            WHERE s.conversation_id = c.id AND s.flow_type = 'feedback_24h'
        ) ap ON true
        WHERE ct.user_id = p_owner AND ct.nps IS NOT NULL
          AND (e->>'dataPesquisa')::timestamptz >= p_start
          AND (e->>'dataPesquisa')::timestamptz < p_end
        ORDER BY (e->>'dataPesquisa')::timestamptz DESC
        LIMIT 10
    ) sub;

    -- ---------- Métricas por atendente (+ IA) ----------
    WITH msg AS (
        SELECT m.conversation_id, m.direction, m.created_at, m.is_ai_response,
               lag(m.direction) OVER w AS prev_dir,
               lag(m.created_at) OVER w AS prev_at
        FROM messages m
        JOIN conversations mc ON mc.id = m.conversation_id
        WHERE m.user_id = p_owner AND mc.group_id IS NULL
          AND m.created_at >= p_start AND m.created_at < p_end
        WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.created_at)
    ), gaps AS (
        SELECT CASE
                   WHEN g.is_ai_response THEN 'ia'
                   ELSE c.assigned_agent_id::text
               END AS who,
               EXTRACT(EPOCH FROM (g.created_at - g.prev_at)) AS gap_s
        FROM msg g
        JOIN conversations c ON c.id = g.conversation_id
        WHERE g.direction = 'outbound' AND g.prev_dir = 'inbound'
    ), gap_agg AS (
        SELECT who, AVG(gap_s) AS avg_gap FROM gaps WHERE who IS NOT NULL GROUP BY who
    ), conv AS (
        SELECT c.id, c.sentiment_score,
               EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) AS dur_s,
               CASE
                   WHEN c.assigned_agent_id IS NOT NULL THEN c.assigned_agent_id::text
                   WHEN c.is_ai_handled THEN 'ia'
               END AS who
        FROM conversations c
        WHERE c.user_id = p_owner AND c.group_id IS NULL
          AND c.created_at >= p_start AND c.created_at < p_end
    ), conv_agg AS (
        SELECT who,
               COUNT(*) AS n_convs,
               SUM(dur_s) AS total_dur,
               AVG(sentiment_score) AS avg_sent
        FROM conv WHERE who IS NOT NULL GROUP BY who
    ), attendants AS (
        SELECT tm.id::text AS who, tm.name, false AS is_ai
        FROM team_members tm WHERE tm.user_id = p_owner
        UNION ALL
        SELECT 'ia', 'IA', true
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.who,
        'name', a.name,
        'is_ai', a.is_ai,
        'avg_response_seconds', ROUND(g.avg_gap::numeric, 0),
        'total_attendance_seconds', ROUND(COALESCE(ca.total_dur, 0)::numeric, 0),
        'avg_sentiment', ROUND(ca.avg_sent::numeric, 1),
        'attendance_count', COALESCE(ca.n_convs, 0)
    ) ORDER BY a.is_ai DESC, a.name), '[]'::jsonb) INTO v_agents
    FROM attendants a
    LEFT JOIN gap_agg g ON g.who = a.who
    LEFT JOIN conv_agg ca ON ca.who = a.who;

    -- ---------- Tabela de templates (todos os cadastrados, Meta) ----------
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'template_status', t.status,
        'last_sent_at', ls.created_at,
        'sent_via', ls.sent_via,
        'sent_by', COALESCE(tm.name, CASE ls.sent_via
            WHEN 'automation' THEN 'Sistema'
            WHEN 'campaign' THEN 'Campanha'
        END),
        'send_status', ls.status,
        'responded', (resp.created_at IS NOT NULL),
        'response_body', resp.body
    ) ORDER BY t.name), '[]'::jsonb) INTO v_templates
    FROM message_templates t
    LEFT JOIN LATERAL (
        SELECT s.* FROM template_sends s
        WHERE s.user_id = p_owner AND s.template_name = t.name
          AND s.created_at >= p_start AND s.created_at < p_end
        ORDER BY s.created_at DESC LIMIT 1
    ) ls ON true
    LEFT JOIN team_members tm ON tm.auth_user_id = ls.sent_by AND tm.user_id = p_owner
    LEFT JOIN LATERAL (
        SELECT m.body, m.created_at FROM messages m
        WHERE ls.conversation_id IS NOT NULL
          AND m.conversation_id = ls.conversation_id
          AND m.direction = 'inbound'
          AND m.created_at > ls.created_at
        ORDER BY m.created_at ASC LIMIT 1
    ) resp ON true
    WHERE t.user_id = p_owner;

    RETURN jsonb_build_object(
        'cards', COALESCE(v_cards, '{}'::jsonb),
        'last_reviews', v_reviews,
        'agents', v_agents,
        'templates', v_templates
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
