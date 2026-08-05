-- Satisfação dashboard: vínculo NPS→conversa, log de envios de template e RPC agregadora

-- 1) add_nps_entry ganha p_conversation_id (gravado na entrada jsonb como conversation_id)
--    DROP obrigatório: nova assinatura com DEFAULT criaria overload ambíguo com a antiga
DROP FUNCTION IF EXISTS add_nps_entry(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_nps_entry(
    p_contact_id UUID,
    p_nota TEXT,
    p_feedback TEXT DEFAULT '',
    p_conversation_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE contacts
    SET nps = COALESCE(nps, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'dataPesquisa', NOW(),
        'nota', p_nota,
        'feedback', COALESCE(p_feedback, ''),
        'conversation_id', p_conversation_id
    ))
    WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_nps_entry TO authenticated;
GRANT EXECUTE ON FUNCTION add_nps_entry TO service_role;

-- 2) Log de envios de template (manual / automação / campanha)
CREATE TABLE IF NOT EXISTS template_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    template_name TEXT NOT NULL,
    conversation_id UUID,
    contact_id UUID,
    sent_by UUID,              -- auth uid do usuário (envios manuais); NULL p/ sistema
    sent_via TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'automation' | 'campaign'
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_sends_user_tpl
    ON template_sends (user_id, template_name, created_at DESC);

ALTER TABLE template_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_sends_select" ON template_sends;
CREATE POLICY "template_sends_select" ON template_sends
    FOR SELECT USING (user_id = get_owner_id());

DROP POLICY IF EXISTS "template_sends_insert" ON template_sends;
CREATE POLICY "template_sends_insert" ON template_sends
    FOR INSERT WITH CHECK (user_id = get_owner_id());

-- 3) Normalizador de nota NPS (mesma tabela de src/lib/nps.ts)
CREATE OR REPLACE FUNCTION nps_nota_to_number(p_nota TEXT)
RETURNS NUMERIC AS $$
    SELECT CASE
        WHEN p_nota ~ '^\d+(\.\d+)?$' THEN p_nota::numeric
        WHEN lower(trim(p_nota)) IN ('excelente', 'excellent') THEN 5
        WHEN lower(trim(p_nota)) IN ('muito bom', 'very good') THEN 4
        WHEN lower(trim(p_nota)) IN ('bom', 'good') THEN 3
        WHEN lower(trim(p_nota)) IN ('regular', 'precisa melhorar') THEN 2
        WHEN lower(trim(p_nota)) IN ('ruim', 'insatisfeito', 'pessimo', 'péssimo', 'bad') THEN 1
        ELSE NULL
    END;
$$ LANGUAGE sql IMMUTABLE;

-- 4) RPC agregadora da aba Satisfação
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
            'sentiment', c.sentiment_score
        ) AS r
        FROM contacts ct
        CROSS JOIN jsonb_array_elements(ct.nps) e
        LEFT JOIN conversations c ON c.id = NULLIF(e->>'conversation_id', '')::uuid
        LEFT JOIN team_members tm ON tm.id = c.assigned_agent_id AND tm.user_id = p_owner
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
    ), nps_by_conv AS (
        SELECT CASE
                   WHEN c.assigned_agent_id IS NOT NULL THEN c.assigned_agent_id::text
                   WHEN c.is_ai_handled THEN 'ia'
               END AS who,
               nps_nota_to_number(e->>'nota') AS nota
        FROM contacts ct
        CROSS JOIN jsonb_array_elements(ct.nps) e
        JOIN conversations c ON c.id = NULLIF(e->>'conversation_id', '')::uuid
        WHERE ct.user_id = p_owner
          AND (e->>'dataPesquisa')::timestamptz >= p_start
          AND (e->>'dataPesquisa')::timestamptz < p_end
    ), nps_agg AS (
        SELECT who, AVG(nota) AS avg_nps
        FROM nps_by_conv WHERE who IS NOT NULL AND nota IS NOT NULL GROUP BY who
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
        'avg_nps', ROUND(n.avg_nps::numeric, 1),
        'avg_sentiment', ROUND(ca.avg_sent::numeric, 1),
        'attendance_count', COALESCE(ca.n_convs, 0)
    ) ORDER BY a.is_ai DESC, a.name), '[]'::jsonb) INTO v_agents
    FROM attendants a
    LEFT JOIN gap_agg g ON g.who = a.who
    LEFT JOIN conv_agg ca ON ca.who = a.who
    LEFT JOIN nps_agg n ON n.who = a.who;

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

GRANT EXECUTE ON FUNCTION get_satisfaction_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_satisfaction_dashboard TO service_role;
