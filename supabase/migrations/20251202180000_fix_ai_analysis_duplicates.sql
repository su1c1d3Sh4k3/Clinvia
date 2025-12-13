-- Remove duplicates from ai_analysis, keeping the most recent one
DELETE FROM public.ai_analysis a
USING public.ai_analysis b
WHERE a.conversation_id = b.conversation_id
  AND a.last_updated < b.last_updated;

-- Ensure there is a unique constraint on conversation_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ai_analysis_conversation_id_key'
    ) THEN
        ALTER TABLE public.ai_analysis
        ADD CONSTRAINT ai_analysis_conversation_id_key UNIQUE (conversation_id);
    END IF;
END $$;
