-- Add last_message_at column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;

-- Create trigger to automatically update last_message_at when messages are inserted
DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON public.messages;

CREATE TRIGGER update_conversation_last_message_trigger
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_last_message();