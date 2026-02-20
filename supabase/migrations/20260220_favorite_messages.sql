-- Add is_favorite to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- Create an index to improve performance when querying favorite messages for a conversation
CREATE INDEX IF NOT EXISTS idx_messages_is_favorite ON messages(is_favorite) WHERE is_favorite = true;
