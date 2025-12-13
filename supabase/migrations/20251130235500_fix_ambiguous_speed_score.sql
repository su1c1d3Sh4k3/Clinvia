CREATE OR REPLACE FUNCTION public.track_response_time()
RETURNS TRIGGER AS $$
DECLARE
  last_client_message TIMESTAMP WITH TIME ZONE;
  duration_seconds INTEGER;
  speed_score_val NUMERIC; -- Renamed variable to avoid ambiguity
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
      speed_score_val := public.calculate_speed_score(duration_seconds);
      
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
      VALUES (NEW.conversation_id, speed_score_val, now())
      ON CONFLICT (conversation_id)
      DO UPDATE SET speed_score = EXCLUDED.speed_score, last_updated = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
