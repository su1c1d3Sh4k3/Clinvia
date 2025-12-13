-- ==========================================
-- PARTE 1: DASHBOARD (Prioridade)
-- ==========================================

-- 1. Adicionar agent_id na tabela response_times
ALTER TABLE public.response_times
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES auth.users(id);

-- 2. Atualizar função de rastreamento de tempo para salvar o agente
CREATE OR REPLACE FUNCTION public.track_response_time()
RETURNS TRIGGER AS $$
DECLARE
  last_client_message TIMESTAMP WITH TIME ZONE;
  duration_seconds INTEGER;
  speed_score NUMERIC;
  current_agent_id UUID;
BEGIN
  IF NEW.direction = 'inbound' THEN
    -- Client message: record the time
    INSERT INTO public.response_times (conversation_id, client_message_time)
    VALUES (NEW.conversation_id, NEW.created_at);
  ELSIF NEW.direction = 'outbound' THEN
    -- Agent response: calculate duration
    
    -- Try to get the agent ID from the current session
    current_agent_id := auth.uid();

    SELECT client_message_time INTO last_client_message
    FROM public.response_times
    WHERE conversation_id = NEW.conversation_id
      AND agent_response_time IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF last_client_message IS NOT NULL THEN
      duration_seconds := EXTRACT(EPOCH FROM (NEW.created_at - last_client_message))::INTEGER;
      speed_score := public.calculate_speed_score(duration_seconds);
      
      -- Update response_times record
      UPDATE public.response_times
      SET agent_response_time = NEW.created_at,
          response_duration_seconds = duration_seconds,
          agent_id = current_agent_id -- Save who responded
      WHERE conversation_id = NEW.conversation_id
        AND agent_response_time IS NULL
        AND client_message_time = last_client_message;
      
      -- Update ai_analysis with new speed_score
      INSERT INTO public.ai_analysis (conversation_id, speed_score, last_updated)
      VALUES (NEW.conversation_id, speed_score, now())
      ON CONFLICT (conversation_id)
      DO UPDATE SET speed_score = speed_score, last_updated = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. RPC: Estatísticas do Dashboard (Gráficos de Pizza)
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'tickets_by_queue', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT q.name, COUNT(c.id) as value
                FROM conversations c
                JOIN queues q ON c.queue_id = q.id
                WHERE c.status IN ('pending', 'open')
                GROUP BY q.name
            ) t
        ),
        'tickets_by_user', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT COALESCE(tm.name, 'Não atribuído') as name, COUNT(c.id) as value
                FROM conversations c
                LEFT JOIN team_members tm ON c.assigned_agent_id = tm.user_id
                WHERE c.status IN ('pending', 'open')
                GROUP BY tm.name
            ) t
        ),
        'tickets_by_status', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT status as name, COUNT(id) as value
                FROM conversations
                WHERE status IN ('pending', 'open', 'resolved')
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
                GROUP BY i.name
            ) t
        ),
        'clients_by_tag', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT t.name, COUNT(DISTINCT ct.contact_id) as value
                FROM contact_tags ct
                JOIN tags t ON ct.tag_id = t.id
                GROUP BY t.name
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC: Métricas Mensais (Gráficos de Linha)
CREATE OR REPLACE FUNCTION get_monthly_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'new_contacts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as month, COUNT(id) as value
                FROM contacts
                WHERE created_at > now() - interval '12 months'
                GROUP BY 1
                ORDER BY 1
            ) t
        ),
        'new_tickets', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as month, COUNT(id) as value
                FROM conversations
                WHERE created_at > now() - interval '12 months'
                GROUP BY 1
                ORDER BY 1
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: Desempenho da Equipe (Tabela)
CREATE OR REPLACE FUNCTION get_team_performance()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    INTO result
    FROM (
        SELECT 
            tm.user_id,
            tm.name,
            p.avatar_url,
            COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_tickets,
            COUNT(CASE WHEN c.status = 'open' THEN 1 END) as open_tickets,
            COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_tickets,
            COALESCE(ROUND(AVG(rt.response_duration_seconds) / 60, 1), 0) as avg_response_time_min,
            COALESCE(ROUND(AVG(da.qualidade), 1), 0) as avg_quality
        FROM team_members tm
        LEFT JOIN profiles p ON tm.user_id = p.id
        LEFT JOIN conversations c ON c.assigned_agent_id = tm.user_id
        LEFT JOIN response_times rt ON rt.agent_id = tm.user_id
        LEFT JOIN dados_atendimento da ON da.user_id = tm.user_id
        GROUP BY tm.user_id, tm.name, p.avatar_url
    ) t;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- PARTE 2: LIMPEZA AUTOMÁTICA (Opcional)
-- ==========================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function to delete old resolved tickets
CREATE OR REPLACE FUNCTION cleanup_old_tickets()
RETURNS void AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM public.conversations
    WHERE status = 'resolved'
    AND created_at < (now() - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old resolved tickets.', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule the job to run daily at 03:00 AM
-- Safe unschedule: only runs if job exists
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-tickets-daily';
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if table doesn't exist or permission denied
    NULL;
END $$;

SELECT cron.schedule(
    'cleanup-tickets-daily', -- name of the cron job
    '0 3 * * *',             -- schedule (3 AM daily)
    'SELECT cleanup_old_tickets()'
);
