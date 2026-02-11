-- Fix: Update insert_transfer_message function to use valid enum value
-- The message_direction enum only supports 'inbound' and 'outbound', not 'system'

CREATE OR REPLACE FUNCTION insert_transfer_message()
RETURNS TRIGGER AS $$
DECLARE
    v_old_queue_name TEXT;
    v_new_queue_name TEXT;
    v_message_body TEXT;
BEGIN
    -- Only proceed if queue_id actually changed
    IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
        -- Get old queue name
        IF OLD.queue_id IS NOT NULL THEN
            SELECT name INTO v_old_queue_name FROM queues WHERE id = OLD.queue_id;
        END IF;
        
        -- Get new queue name
        IF NEW.queue_id IS NOT NULL THEN
            SELECT name INTO v_new_queue_name FROM queues WHERE id = NEW.queue_id;
        END IF;
        
        -- Create transfer message
        v_message_body := format(
            'Conversa %s transferida de %s para %s',
            substring(NEW.id::text, 1, 8),
            COALESCE(v_old_queue_name, 'Sem fila'),
            COALESCE(v_new_queue_name, 'Sem fila')
        );
        
        -- Insert system message using 'outbound' direction (from system to user)
        INSERT INTO messages (
            conversation_id, 
            user_id, 
            body, 
            message_type, 
            direction
        ) VALUES (
            NEW.id,
            NEW.user_id,
            v_message_body,
            'text',
            'outbound'  -- Changed from 'system' to 'outbound'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
