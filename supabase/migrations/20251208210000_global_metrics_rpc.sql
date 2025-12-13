-- Create RPC to get global metrics for dashboard gauges
-- Uses ai_analysis.sentiment_score for quality and response_times for response time
CREATE OR REPLACE FUNCTION get_global_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        -- Média de qualidade (sentiment_score da tabela ai_analysis)
        'avg_quality', (
            SELECT COALESCE(ROUND(AVG(sentiment_score)::numeric, 1), 0)
            FROM ai_analysis
            WHERE sentiment_score IS NOT NULL
        ),
        -- Média de velocidade (speed_score da tabela ai_analysis)
        'avg_speed', (
            SELECT COALESCE(ROUND(AVG(speed_score)::numeric, 1), 0)
            FROM ai_analysis
            WHERE speed_score IS NOT NULL
        ),
        -- Média de tempo de resposta em segundos
        'avg_response_time_seconds', (
            SELECT COALESCE(ROUND(AVG(response_duration_seconds)::numeric), 0)
            FROM response_times
            WHERE response_duration_seconds IS NOT NULL
              AND response_duration_seconds < 86400  -- excluir outliers (> 24h)
        ),
        -- Total de análises
        'total_evaluations', (
            SELECT COUNT(*)
            FROM ai_analysis
            WHERE sentiment_score IS NOT NULL
        ),
        -- Variação semanal de qualidade
        'quality_change', (
            WITH current_week AS (
                SELECT AVG(sentiment_score) as avg_q
                FROM ai_analysis
                WHERE last_updated > now() - interval '7 days'
                  AND sentiment_score IS NOT NULL
            ),
            previous_week AS (
                SELECT AVG(sentiment_score) as avg_q
                FROM ai_analysis
                WHERE last_updated > now() - interval '14 days'
                  AND last_updated <= now() - interval '7 days'
                  AND sentiment_score IS NOT NULL
            )
            SELECT CASE 
                WHEN previous_week.avg_q IS NULL OR previous_week.avg_q = 0 THEN 0
                ELSE ROUND(((current_week.avg_q - previous_week.avg_q) / previous_week.avg_q * 100)::numeric, 1)
            END
            FROM current_week, previous_week
        ),
        -- Variação semanal de tempo de resposta
        'response_time_change', (
            WITH current_week AS (
                SELECT AVG(response_duration_seconds) as avg_rt
                FROM response_times
                WHERE created_at > now() - interval '7 days'
                  AND response_duration_seconds IS NOT NULL
                  AND response_duration_seconds < 86400
            ),
            previous_week AS (
                SELECT AVG(response_duration_seconds) as avg_rt
                FROM response_times
                WHERE created_at > now() - interval '14 days'
                  AND created_at <= now() - interval '7 days'
                  AND response_duration_seconds IS NOT NULL
                  AND response_duration_seconds < 86400
            )
            SELECT CASE 
                WHEN previous_week.avg_rt IS NULL OR previous_week.avg_rt = 0 THEN 0
                ELSE ROUND(((current_week.avg_rt - previous_week.avg_rt) / previous_week.avg_rt * 100)::numeric, 1)
            END
            FROM current_week, previous_week
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
