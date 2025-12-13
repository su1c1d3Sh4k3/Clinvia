-- Add summary column to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Update RLS policies to allow authenticated users to update conversations (already exists but good to verify)
-- The existing policy "Authenticated users can manage conversations" covers this.
