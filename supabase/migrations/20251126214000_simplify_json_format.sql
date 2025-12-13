-- 1. Update function to use simplified JSON format
CREATE OR REPLACE FUNCTION sync_messages_to_history()
RETURNS TRIGGER AS $$
DECLARE
    new_message_obj JSONB;
BEGIN
    -- Construct the JSON object based on direction
    IF NEW.direction = 'inbound' THEN
        new_message_obj := jsonb_build_object('user', COALESCE(NEW.body, '[Mídia]'));
    ELSE
        new_message_obj := jsonb_build_object('assistant', COALESCE(NEW.body, '[Mídia]'));
    END IF;

    -- Append to the array in conversations table
    UPDATE conversations
    SET messages_history = messages_history || new_message_obj
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Re-Backfill existing data with new format
WITH aggregated_history AS (
    SELECT 
        conversation_id,
        jsonb_agg(
            CASE 
                WHEN direction = 'inbound' THEN jsonb_build_object('user', COALESCE(body, '[Mídia]'))
                ELSE jsonb_build_object('assistant', COALESCE(body, '[Mídia]'))
            END
            ORDER BY created_at ASC
        ) as history
    FROM messages
    GROUP BY conversation_id
)
UPDATE conversations c
SET messages_history = ah.history
FROM aggregated_history ah
WHERE c.id = ah.conversation_id;
