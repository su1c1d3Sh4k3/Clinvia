-- =====================================================
-- Fix get_team_performance() function
-- =====================================================
-- Problem: The function was using tm.user_id for joins but:
-- 1. conversations.assigned_agent_id now references team_members.id
-- 2. response_times.agent_id references auth.users not team_members
-- 3. dados_atendimento doesn't have agent-specific quality data
-- 
-- Solution: Use ai_analysis for quality scores and fix the joins
-- =====================================================

CREATE OR REPLACE FUNCTION get_team_performance()
RETURNS JSON AS $$
DECLARE
    result JSON;
    current_owner_id UUID;
BEGIN
    -- Get the owner_id for the current user (for multi-tenancy)
    -- First try to get it from team_members via auth_user_id
    SELECT tm.user_id INTO current_owner_id
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Fallback: check if user is admin (user_id = auth.uid())
    IF current_owner_id IS NULL THEN
        SELECT tm.user_id INTO current_owner_id
        FROM team_members tm
        WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
        LIMIT 1;
    END IF;
    
    -- Final fallback: use auth.uid() directly
    IF current_owner_id IS NULL THEN
        current_owner_id := auth.uid();
    END IF;

    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    INTO result
    FROM (
        SELECT 
            tm.id as team_member_id,
            tm.user_id,
            tm.name,
            tm.avatar_url,
            -- Count tickets by status using team_members.id (not user_id)
            COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_tickets,
            COUNT(CASE WHEN c.status = 'open' THEN 1 END) as open_tickets,
            COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_tickets,
            -- Response time: join response_times via auth_user_id or fallback to user_id
            COALESCE(
                ROUND(AVG(rt.response_duration_seconds) / 60, 1), 
                0
            ) as avg_response_time_min,
            -- Quality: Get average from ai_analysis sentiment scores for assigned conversations
            COALESCE(
                ROUND(AVG(aa.sentiment_score), 1), 
                0
            ) as avg_quality
        FROM team_members tm
        -- Join conversations via team_members.id (assigned_agent_id references team_members.id)
        LEFT JOIN conversations c ON c.assigned_agent_id = tm.id
        -- Join response_times via auth_user_id (response_times.agent_id references auth.users)
        LEFT JOIN response_times rt ON (
            rt.agent_id = tm.auth_user_id 
            OR rt.agent_id = tm.user_id
        )
        -- Join ai_analysis for quality scores on assigned conversations
        LEFT JOIN ai_analysis aa ON aa.conversation_id = c.id
        -- MULTI-TENANCY FILTER: Only show team members from the same team (same user_id/owner)
        WHERE tm.user_id = current_owner_id
          AND tm.role IN ('agent', 'supervisor', 'admin')
        GROUP BY tm.id, tm.user_id, tm.name, tm.avatar_url
    ) t;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix get_dashboard_stats to use correct join AND multi-tenancy
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
    current_owner_id UUID;
BEGIN
    -- Get the owner_id for the current user (for multi-tenancy)
    SELECT tm.user_id INTO current_owner_id
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid()
    LIMIT 1;
    
    IF current_owner_id IS NULL THEN
        SELECT tm.user_id INTO current_owner_id
        FROM team_members tm
        WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
        LIMIT 1;
    END IF;
    
    IF current_owner_id IS NULL THEN
        current_owner_id := auth.uid();
    END IF;

    SELECT json_build_object(
        'tickets_by_queue', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT q.name, COUNT(c.id) as value
                FROM conversations c
                JOIN queues q ON c.queue_id = q.id
                WHERE c.status IN ('pending', 'open')
                  AND c.user_id = current_owner_id
                GROUP BY q.name
            ) t
        ),
        'tickets_by_user', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT COALESCE(tm.name, 'Não atribuído') as name, COUNT(c.id) as value
                FROM conversations c
                LEFT JOIN team_members tm ON c.assigned_agent_id = tm.id
                WHERE c.status IN ('pending', 'open')
                  AND c.user_id = current_owner_id
                GROUP BY tm.name
            ) t
        ),
        'tickets_by_status', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT status as name, COUNT(id) as value
                FROM conversations
                WHERE status IN ('pending', 'open', 'resolved')
                  AND user_id = current_owner_id
                GROUP BY status
            ) t
        ),
        'tickets_by_connection', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT COALESCE(i.name, 'Desconhecido') as name, COUNT(c.id) as value
                FROM conversations c
                LEFT JOIN instances i ON c.instance_id = i.id
                WHERE c.status IN ('pending', 'open')
                  AND c.user_id = current_owner_id
                GROUP BY i.name
            ) t
        ),
        'clients_by_tag', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT t.name, COUNT(DISTINCT ct.contact_id) as value
                FROM contact_tags ct
                JOIN tags t ON ct.tag_id = t.id
                JOIN contacts co ON ct.contact_id = co.id
                WHERE co.user_id = current_owner_id
                GROUP BY t.name
            ) t
        ),
        'daily_new_tickets', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT 
                    to_char(created_at::date, 'DD/MM') as date,
                    COUNT(*) as count
                FROM conversations
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                  AND user_id = current_owner_id
                GROUP BY created_at::date
                ORDER BY created_at::date
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
