-- Add queue_id to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_conversations_queue_id ON conversations(queue_id);
