-- =====================================================
-- RPC: get_attendance_metrics
-- Métricas consolidadas do Relatório de Atendimento
-- =====================================================
-- Retorna JSON com:
--   total_conversations
--   avg_first_response_seconds_ai / _human
--   count_ai_handled / count_human_handled
--   count_outside_business_hours / count_inside_business_hours
--   count_abandoned / abandonment_rate
--   avg_sentiment_score (IA analisa 0-10)
--   avg_nps / total_nps_responses (cliente avalia 1-5)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_attendance_metrics(
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
    result JSON;
    current_owner_id UUID;
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
    -- Resolve owner (mesmo pattern do get_dashboard_global_metrics)
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

    -- Total de conversas no período
    SELECT COUNT(*) INTO v_total
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end;

    -- Tempo médio 1ª resposta — IA
    SELECT AVG(first_response_duration_seconds) INTO v_avg_fr_ai
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND first_response_by_ai = true
      AND first_response_duration_seconds IS NOT NULL
      AND first_response_duration_seconds < 86400;

    -- Tempo médio 1ª resposta — Humano
    SELECT AVG(first_response_duration_seconds) INTO v_avg_fr_human
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND first_response_by_ai = false
      AND first_response_duration_seconds IS NOT NULL
      AND first_response_duration_seconds < 86400;

    -- IA vs Humano
    SELECT COUNT(*) INTO v_count_ai
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND is_ai_handled = true;

    v_count_human := GREATEST(COALESCE(v_total, 0) - COALESCE(v_count_ai, 0), 0);

    -- Fora do expediente (total)
    SELECT COUNT(*) INTO v_count_outside
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND is_outside_business_hours = true;

    v_count_inside := GREATEST(COALESCE(v_total, 0) - COALESCE(v_count_outside, 0), 0);

    -- Abandono: criadas no período, não resolvidas/fechadas, sem mensagem do cliente em 48h
    SELECT COUNT(*) INTO v_count_abandoned
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND status NOT IN ('resolved', 'closed')
      AND (
          last_customer_message_at IS NULL
          OR last_customer_message_at < NOW() - INTERVAL '48 hours'
      );

    -- Sentiment médio da IA (0-10) das conversas do período
    SELECT AVG(sentiment_score) INTO v_avg_sentiment
    FROM public.conversations
    WHERE user_id = current_owner_id
      AND created_at >= p_start AND created_at <= p_end
      AND sentiment_score IS NOT NULL;

    -- NPS: flatten do array JSONB de contacts.nps filtrado por dataPesquisa
    WITH nps_items AS (
        SELECT
            NULLIF(entry->>'nota', '')::NUMERIC AS nota,
            NULLIF(entry->>'dataPesquisa', '')::TIMESTAMPTZ AS data_pesquisa
        FROM public.contacts c,
             jsonb_array_elements(COALESCE(c.nps, '[]'::jsonb)) AS entry
        WHERE c.user_id = current_owner_id
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

GRANT EXECUTE ON FUNCTION public.get_attendance_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
