-- Create dados_atendimento table
CREATE TABLE IF NOT EXISTS public.dados_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  ticket_id UUID REFERENCES public.conversations(id),
  team_id UUID,
  qualidade NUMERIC CHECK (qualidade >= 0 AND qualidade <= 10),
  velocidade NUMERIC CHECK (velocidade >= 0 AND velocidade <= 10),
  resumo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create response_times table
CREATE TABLE IF NOT EXISTS public.response_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id),
  client_message_time TIMESTAMP WITH TIME ZONE,
  agent_response_time TIMESTAMP WITH TIME ZONE,
  response_duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add speed_score to ai_analysis
ALTER TABLE public.ai_analysis 
ADD COLUMN IF NOT EXISTS speed_score NUMERIC CHECK (speed_score >= 0 AND speed_score <= 10) DEFAULT 5;

-- Create function to calculate speed score
CREATE OR REPLACE FUNCTION public.calculate_speed_score(duration_seconds INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  IF duration_seconds <= 180 THEN
    RETURN 10; -- 0-3 min: Excelente
  ELSIF duration_seconds <= 360 THEN
    -- 3-6 min: Linear 9 to 6
    RETURN 9 - ((duration_seconds - 180) * 3.0 / 180);
  ELSIF duration_seconds <= 600 THEN
    -- 6-10 min: Linear 5 to 3
    RETURN 5 - ((duration_seconds - 360) * 2.0 / 240);
  ELSIF duration_seconds <= 900 THEN
    -- 10-15 min: Linear 2 to 1
    RETURN 2 - ((duration_seconds - 600) * 1.0 / 300);
  ELSE
    RETURN 0; -- >15 min: Muito demorado
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to track response times
CREATE OR REPLACE FUNCTION public.track_response_time()
RETURNS TRIGGER AS $$
DECLARE
  last_client_message TIMESTAMP WITH TIME ZONE;
  duration_seconds INTEGER;
  speed_score NUMERIC;
BEGIN
  IF NEW.direction = 'inbound' THEN
    -- Client message: record the time
    INSERT INTO public.response_times (conversation_id, client_message_time)
    VALUES (NEW.conversation_id, NEW.created_at);
  ELSIF NEW.direction = 'outbound' THEN
    -- Agent response: calculate duration
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
          response_duration_seconds = duration_seconds
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

-- Create trigger on messages table
DROP TRIGGER IF EXISTS track_response_time_trigger ON public.messages;
CREATE TRIGGER track_response_time_trigger
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.track_response_time();

-- Create trigger for updated_at on dados_atendimento
DROP TRIGGER IF EXISTS update_dados_atendimento_updated_at ON public.dados_atendimento;
CREATE TRIGGER update_dados_atendimento_updated_at
BEFORE UPDATE ON public.dados_atendimento
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE public.dados_atendimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_times ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dados_atendimento
CREATE POLICY "Authenticated users can view all dados_atendimento"
ON public.dados_atendimento FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create dados_atendimento"
ON public.dados_atendimento FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update own dados_atendimento"
ON public.dados_atendimento FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for response_times
CREATE POLICY "Authenticated users can view response_times"
ON public.response_times FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System can manage response_times"
ON public.response_times FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);