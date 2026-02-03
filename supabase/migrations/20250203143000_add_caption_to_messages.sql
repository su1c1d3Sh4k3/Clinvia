-- Add caption column to messages table
-- This allows storing user message separately from filename for documents

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS caption TEXT;

-- Add comment for documentation
COMMENT ON COLUMN messages.caption IS 'User message/caption sent with media files (separate from body which contains filename for documents)';
