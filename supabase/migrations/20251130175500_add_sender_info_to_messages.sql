-- Add sender info columns to messages table for group chats
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_jid TEXT,
ADD COLUMN IF NOT EXISTS sender_profile_pic_url TEXT;

-- Index for performance on sender_jid
CREATE INDEX IF NOT EXISTS idx_messages_sender_jid ON public.messages(sender_jid);
