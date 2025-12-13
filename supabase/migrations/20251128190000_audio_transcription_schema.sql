-- 1. Add transcription column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS transcription TEXT;

-- 2. Function to archive messages into conversation history BEFORE resolution
-- This ensures we capture the final state of messages (including transcriptions)
CREATE OR REPLACE FUNCTION archive_messages_before_resolve()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run if status is changing to 'resolved'
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        
        -- Aggregate all messages for this conversation into a JSON array
        -- We include the 'transcription' field here
        NEW.messages_history := (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
                    'content', COALESCE(body, '[Mídia]'),
                    'transcription', transcription,
                    'type', message_type,
                    'media_url', media_url,
                    'created_at', created_at
                ) ORDER BY created_at ASC
            )
            FROM public.messages
            WHERE conversation_id = NEW.id
        );

        -- If no messages found, ensure it's an empty array instead of null
        IF NEW.messages_history IS NULL THEN
            NEW.messages_history := '[]'::jsonb;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger to run BEFORE update on conversations
DROP TRIGGER IF EXISTS on_resolve_archive_history ON public.conversations;

CREATE TRIGGER on_resolve_archive_history
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION archive_messages_before_resolve();

-- 4. Drop the old "sync on insert" trigger/function as it is now redundant and less robust
DROP TRIGGER IF EXISTS on_message_created ON public.messages;
DROP FUNCTION IF EXISTS sync_messages_to_history();
