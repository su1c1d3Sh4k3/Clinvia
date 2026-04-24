-- =====================================================
-- Fix: NPS agregacao suporta valores TEXTO e NUMERICO
-- =====================================================
-- O campo nota em contacts.nps (JSONB) pode vir como:
--   - numerico: "5", "4", "3"...
--   - texto: "Excelente", "Muito Bom", "Bom", "Regular", "Ruim"
-- O cast puro ::NUMERIC explodia em textos. Agora mapeamos texto → numero.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_attendance_metrics_for_owner(
    p_owner UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
    result JSON;
    v_total INTEGER;
    v_avg_fr_ai NUMERIC;
    v_avg_fr_human NUMERIC;
    v_count_ai INTEGER;
    v_count_human INTEGER;
    v_count_outside INTEGER;
    v_count_inside INTEGER;
    v_count_abandoned INTEGER;
    v_avg_sentiment NUMERIC;
    v_avg_nps NUMERIC;
    v_nps_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end;

    SELECT AVG(first_response_duration_seconds) INTO v_avg_fr_ai
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND first_response_by_ai = true
      AND first_response_duration_seconds IS NOT NULL
      AND first_response_duration_seconds < 86400;

    SELECT AVG(first_response_duration_seconds) INTO v_avg_fr_human
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND first_response_by_ai = false
      AND first_response_duration_seconds IS NOT NULL
      AND first_response_duration_seconds < 86400;

    SELECT COUNT(*) INTO v_count_ai
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND is_ai_handled = true;

    v_count_human := GREATEST(COALESCE(v_total, 0) - COALESCE(v_count_ai, 0), 0);

    SELECT COUNT(*) INTO v_count_outside
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND is_outside_business_hours = true;

    v_count_inside := GREATEST(COALESCE(v_total, 0) - COALESCE(v_count_outside, 0), 0);

    SELECT COUNT(*) INTO v_count_abandoned
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND status NOT IN ('resolved', 'closed')
      AND COALESCE(last_customer_message_at, created_at) < NOW() - INTERVAL '48 hours';

    SELECT AVG(sentiment_score) INTO v_avg_sentiment
    FROM public.conversations
    WHERE user_id = p_owner
      AND created_at >= p_start AND created_at <= p_end
      AND sentiment_score IS NOT NULL;

    WITH nps_items AS (
        SELECT
            CASE
                WHEN entry->>'nota' ~ '^[0-9]+(\.[0-9]+)?$' THEN (entry->>'nota')::NUMERIC
                WHEN LOWER(TRIM(entry->>'nota')) IN ('excelente', 'excellent') THEN 5
                WHEN LOWER(TRIM(entry->>'nota')) IN ('muito bom', 'very good') THEN 4
                WHEN LOWER(TRIM(entry->>'nota')) = 'bom' OR LOWER(TRIM(entry->>'nota')) = 'good' THEN 3
                WHEN LOWER(TRIM(entry->>'nota')) = 'regular' THEN 2
                WHEN LOWER(TRIM(entry->>'nota')) IN ('ruim', 'bad', 'pessimo', 'péssimo') THEN 1
                ELSE NULL
            END AS nota,
            NULLIF(entry->>'dataPesquisa', '')::TIMESTAMPTZ AS data_pesquisa
        FROM public.contacts c,
             jsonb_array_elements(COALESCE(c.nps, '[]'::jsonb)) AS entry
        WHERE c.user_id = p_owner
          AND jsonb_typeof(c.nps) = 'array'
    )
    SELECT AVG(nota), COUNT(*)
    INTO v_avg_nps, v_nps_count
    FROM nps_items
    WHERE data_pesquisa >= p_start
      AND data_pesquisa <= p_end
      AND nota IS NOT NULL;

    result := json_build_object(
        'total_conversations', COALESCE(v_total, 0),
        'avg_first_response_seconds_ai', ROUND(COALESCE(v_avg_fr_ai, 0)::numeric, 0),
        'avg_first_response_seconds_human', ROUND(COALESCE(v_avg_fr_human, 0)::numeric, 0),
        'count_ai_handled', COALESCE(v_count_ai, 0),
        'count_human_handled', v_count_human,
        'count_outside_business_hours', COALESCE(v_count_outside, 0),
        'count_inside_business_hours', v_count_inside,
        'count_abandoned', COALESCE(v_count_abandoned, 0),
        'abandonment_rate', CASE
            WHEN COALESCE(v_total, 0) > 0
                THEN ROUND((COALESCE(v_count_abandoned, 0)::NUMERIC / v_total) * 100, 1)
            ELSE 0
        END,
        'avg_sentiment_score', ROUND(COALESCE(v_avg_sentiment, 0)::numeric, 1),
        'avg_nps', ROUND(COALESCE(v_avg_nps, 0)::numeric, 2),
        'total_nps_responses', COALESCE(v_nps_count, 0)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_attendance_metrics_for_owner(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
    TO authenticated, service_role;
