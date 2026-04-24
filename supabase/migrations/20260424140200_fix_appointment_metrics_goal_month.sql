-- Fix: extracao do mes/ano para lookup de meta nao deve aplicar TZ shift.
-- Se p_start='2029-06-01T00:00:00Z', queremos mes=6, nao mes=5 (que e o que
-- AT TIME ZONE SP retornava porque vira '2029-05-31 21:00' em SP).
-- Tambem: generate_series do daily_progress agora vai de p_start::DATE a p_end::DATE
-- (sem cap de NOW()), para periodos futuros terem esqueleto.

CREATE OR REPLACE FUNCTION public.get_appointment_metrics_for_owner(
    p_owner UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
    result JSON;
    v_total INTEGER;
    v_pending INTEGER;
    v_confirmed INTEGER;
    v_rescheduled INTEGER;
    v_completed INTEGER;
    v_canceled INTEGER;
    v_not_completed INTEGER;
    v_pure_no_show INTEGER;
    v_no_show_rate NUMERIC;
    v_canceled_rate NUMERIC;
    v_by_professional JSON;
    v_by_dow JSON;
    v_by_heatmap JSON;
    v_daily_progress JSON;
    v_goal_month INTEGER;
    v_goal_year INTEGER;
    v_goal_target INTEGER;
    v_goal_achieved INTEGER;
    v_goal JSON;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'confirmed'),
        COUNT(*) FILTER (WHERE status = 'rescheduled'),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'canceled')
    INTO v_total, v_pending, v_confirmed, v_rescheduled, v_completed, v_canceled
    FROM public.appointments
    WHERE user_id = p_owner
      AND type = 'appointment'
      AND start_time >= p_start AND start_time <= p_end;

    v_not_completed := GREATEST(COALESCE(v_total, 0) - COALESCE(v_completed, 0), 0);
    v_pure_no_show := GREATEST(v_not_completed - COALESCE(v_canceled, 0), 0);
    v_no_show_rate := CASE WHEN v_total > 0
        THEN ROUND(v_not_completed::NUMERIC / v_total * 100, 1) ELSE 0 END;
    v_canceled_rate := CASE WHEN v_total > 0
        THEN ROUND(COALESCE(v_canceled, 0)::NUMERIC / v_total * 100, 1) ELSE 0 END;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::json)
    INTO v_by_professional
    FROM (
        SELECT
            p.id AS professional_id,
            COALESCE(p.name, 'Sem profissional') AS professional_name,
            COUNT(a.id)::INTEGER AS count
        FROM public.appointments a
        LEFT JOIN public.professionals p ON p.id = a.professional_id
        WHERE a.user_id = p_owner
          AND a.type = 'appointment'
          AND a.start_time >= p_start AND a.start_time <= p_end
        GROUP BY p.id, p.name
        ORDER BY count DESC
        LIMIT 10
    ) t;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.dow), '[]'::json)
    INTO v_by_dow
    FROM (
        SELECT
            EXTRACT(DOW FROM start_time AT TIME ZONE 'America/Sao_Paulo')::INTEGER AS dow,
            COUNT(*)::INTEGER AS count
        FROM public.appointments
        WHERE user_id = p_owner
          AND type = 'appointment'
          AND start_time >= p_start AND start_time <= p_end
        GROUP BY 1
    ) t;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.dow, t.hour), '[]'::json)
    INTO v_by_heatmap
    FROM (
        SELECT
            EXTRACT(DOW FROM start_time AT TIME ZONE 'America/Sao_Paulo')::INTEGER AS dow,
            EXTRACT(HOUR FROM start_time AT TIME ZONE 'America/Sao_Paulo')::INTEGER AS hour,
            COUNT(*)::INTEGER AS count
        FROM public.appointments
        WHERE user_id = p_owner
          AND type = 'appointment'
          AND start_time >= p_start AND start_time <= p_end
        GROUP BY 1, 2
    ) t;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
    INTO v_daily_progress
    FROM (
        SELECT
            to_char(d.day, 'YYYY-MM-DD') AS date,
            (SELECT COUNT(*)::INTEGER
             FROM public.appointments a
             WHERE a.user_id = p_owner
               AND a.type = 'appointment'
               AND a.status = 'completed'
               AND (a.start_time AT TIME ZONE 'America/Sao_Paulo')::DATE <= d.day
               AND a.start_time >= p_start
               AND a.start_time <= p_end
            ) AS cumulative
        FROM generate_series(p_start::DATE, p_end::DATE, '1 day'::interval) AS d(day)
    ) t;

    v_goal_month := EXTRACT(MONTH FROM p_start)::INTEGER;
    v_goal_year := EXTRACT(YEAR FROM p_start)::INTEGER;

    SELECT target INTO v_goal_target
    FROM public.appointment_goals
    WHERE user_id = p_owner AND month = v_goal_month AND year = v_goal_year
    LIMIT 1;

    IF v_goal_target IS NULL THEN
        v_goal := NULL;
    ELSE
        SELECT COUNT(*)::INTEGER INTO v_goal_achieved
        FROM public.appointments
        WHERE user_id = p_owner
          AND type = 'appointment'
          AND status = 'completed'
          AND EXTRACT(MONTH FROM start_time) = v_goal_month
          AND EXTRACT(YEAR FROM start_time) = v_goal_year;

        v_goal := json_build_object(
            'target', v_goal_target,
            'month', v_goal_month,
            'year', v_goal_year,
            'achieved', COALESCE(v_goal_achieved, 0),
            'progress_pct', CASE WHEN v_goal_target > 0
                THEN ROUND(COALESCE(v_goal_achieved, 0)::NUMERIC / v_goal_target * 100, 1)
                ELSE 0 END
        );
    END IF;

    result := json_build_object(
        'total', COALESCE(v_total, 0),
        'counts_by_status', json_build_object(
            'pending', COALESCE(v_pending, 0),
            'confirmed', COALESCE(v_confirmed, 0),
            'rescheduled', COALESCE(v_rescheduled, 0),
            'completed', COALESCE(v_completed, 0),
            'canceled', COALESCE(v_canceled, 0)
        ),
        'completed_count', COALESCE(v_completed, 0),
        'not_completed_count', v_not_completed,
        'no_show_rate', v_no_show_rate,
        'canceled_rate', v_canceled_rate,
        'pure_no_show', v_pure_no_show,
        'by_professional', v_by_professional,
        'by_day_of_week', v_by_dow,
        'by_hour_heatmap', v_by_heatmap,
        'daily_progress', v_daily_progress,
        'goal', v_goal
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
