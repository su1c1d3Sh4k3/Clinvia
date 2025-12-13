-- Add last_message_at column to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now();

-- Backfill last_message_at with updated_at for existing records
UPDATE public.conversations
SET last_message_at = updated_at;

-- Create index for performance on sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
