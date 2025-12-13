-- =============================================
-- Add reply and delete columns to messages table
-- For message actions: reply, edit, delete, react
-- =============================================

-- Add columns for reply/quote functionality
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id TEXT,
ADD COLUMN IF NOT EXISTS quoted_body TEXT,
ADD COLUMN IF NOT EXISTS quoted_sender TEXT;

-- Add soft delete column
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Create index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);

-- Comment explaining columns
COMMENT ON COLUMN public.messages.reply_to_id IS 'evolution_id of the message being replied to';
COMMENT ON COLUMN public.messages.quoted_body IS 'Content of the quoted message for offline display';
COMMENT ON COLUMN public.messages.quoted_sender IS 'Name of the original sender of quoted message';
COMMENT ON COLUMN public.messages.is_deleted IS 'Soft delete flag - message was deleted for everyone';
