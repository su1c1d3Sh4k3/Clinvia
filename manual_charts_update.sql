-- Atualização dos Gráficos do Dashboard

-- Função atualizada para retornar dados diários (30 dias) e mensais (12 meses)
CREATE OR REPLACE FUNCTION get_dashboard_history()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'daily_new_contacts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                WITH days AS (
                    SELECT generate_series(
                        date_trunc('day', now() - interval '29 days'),
                        date_trunc('day', now()),
                        '1 day'::interval
                    ) as day
                )
                SELECT 
                    to_char(d.day, 'DD/MM') as date,
                    COUNT(c.id) as value
                FROM days d
                LEFT JOIN contacts c ON date_trunc('day', c.created_at) = d.day
                GROUP BY d.day
                ORDER BY d.day
            ) t
        ),
        'daily_new_tickets', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                WITH days AS (
                    SELECT generate_series(
                        date_trunc('day', now() - interval '29 days'),
                        date_trunc('day', now()),
                        '1 day'::interval
                    ) as day
                )
                SELECT 
                    to_char(d.day, 'DD/MM') as date,
                    COUNT(conv.id) as value
                FROM days d
                LEFT JOIN conversations conv ON date_trunc('day', conv.created_at) = d.day
                GROUP BY d.day
                ORDER BY d.day
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
                    ) as month
                )
                SELECT 
                    to_char(m.month, 'MM/YYYY') as month,
                    COUNT(DISTINCT c.id) as new_contacts,
                    COUNT(DISTINCT conv.id) as new_tickets
                FROM months m
                LEFT JOIN contacts c ON date_trunc('month', c.created_at) = m.month
                LEFT JOIN conversations conv ON date_trunc('month', conv.created_at) = m.month
                GROUP BY m.month
                ORDER BY m.month
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
