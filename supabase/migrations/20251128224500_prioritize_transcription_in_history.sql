-- 1. Update the archive function to prioritize transcription in 'content'
CREATE OR REPLACE FUNCTION archive_messages_before_resolve()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run if status is changing to 'resolved'
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        
        NEW.messages_history := (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
                    -- Prioritize transcription over body
                    'content', COALESCE(transcription, body, '[Mídia]'),
                    'transcription', transcription,
                    'type', message_type,
                    'media_url', media_url,
                    'created_at', created_at
                ) ORDER BY created_at ASC
            )
            FROM public.messages
            WHERE conversation_id = NEW.id
        );

        IF NEW.messages_history IS NULL THEN
            NEW.messages_history := '[]'::jsonb;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the sync function to prioritize transcription in 'content'
CREATE OR REPLACE FUNCTION update_history_on_message_update()
RETURNS TRIGGER AS $$
DECLARE
    parent_conversation_status TEXT;
BEGIN
    SELECT status INTO parent_conversation_status
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF parent_conversation_status = 'resolved' THEN
        UPDATE public.conversations
        SET messages_history = (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
                    -- Prioritize transcription over body
                    'content', COALESCE(transcription, body, '[Mídia]'),
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

-- 3. Retroactively fix existing resolved conversations
UPDATE conversations
SET messages_history = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
            'content', COALESCE(transcription, body, '[Mídia]'),
            'transcription', transcription,
            'type', message_type,
            'media_url', media_url,
            'created_at', created_at
        ) ORDER BY created_at ASC
    )
    FROM public.messages
    WHERE conversation_id = conversations.id
)
WHERE status = 'resolved';
