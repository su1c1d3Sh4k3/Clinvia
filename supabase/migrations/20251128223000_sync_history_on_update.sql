-- Function to update conversation history when a message is updated (e.g. transcription added)
CREATE OR REPLACE FUNCTION update_history_on_message_update()
RETURNS TRIGGER AS $$
DECLARE
    parent_conversation_status TEXT;
BEGIN
    -- Check the status of the parent conversation
    SELECT status INTO parent_conversation_status
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    -- If the conversation is resolved, we need to update the history snapshot
    IF parent_conversation_status = 'resolved' THEN
        UPDATE public.conversations
        SET messages_history = (
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
            WHERE conversation_id = NEW.conversation_id
        )
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger to run AFTER UPDATE on messages
DROP TRIGGER IF EXISTS on_message_update_sync_history ON public.messages;

CREATE TRIGGER on_message_update_sync_history
AFTER UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION update_history_on_message_update();
