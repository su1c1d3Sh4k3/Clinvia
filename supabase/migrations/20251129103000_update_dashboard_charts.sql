-- Update get_monthly_metrics to return daily data for 30 days and combined monthly data
CREATE OR REPLACE FUNCTION get_dashboard_history()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'daily_new_contacts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT to_char(date_trunc('day', created_at), 'DD/MM') as date, COUNT(id) as value
                FROM contacts
                WHERE created_at > now() - interval '30 days'
                GROUP BY 1
                ORDER BY date_trunc('day', created_at)
            ) t
        ),
        'daily_new_tickets', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT to_char(date_trunc('day', created_at), 'DD/MM') as date, COUNT(id) as value
                FROM conversations
                WHERE created_at > now() - interval '30 days'
                GROUP BY 1
                ORDER BY date_trunc('day', created_at)
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
