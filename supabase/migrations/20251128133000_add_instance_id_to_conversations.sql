-- Add instance_id to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES instances(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id ON conversations(instance_id);
