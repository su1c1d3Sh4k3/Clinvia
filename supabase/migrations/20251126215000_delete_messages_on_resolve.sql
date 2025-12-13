-- Create function to delete messages on resolution
CREATE OR REPLACE FUNCTION delete_messages_on_resolve()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if status changed to 'resolved'
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        DELETE FROM messages WHERE conversation_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger on conversations table
DROP TRIGGER IF EXISTS on_conversation_resolve ON conversations;

CREATE TRIGGER on_conversation_resolve
AFTER UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION delete_messages_on_resolve();
