-- Fix 'conversations' table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message TEXT,
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Fix 'contacts' table (re-applying in case previous failed)
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_instance_id ON contacts(instance_id);

-- Fix 'messages' table (ensuring all fields used by webhook exist)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS evolution_id TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_jid TEXT,
ADD COLUMN IF NOT EXISTS sender_profile_pic_url TEXT,
ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Ensure unique constraint on evolution_id (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'messages_evolution_id_key'
    ) THEN
        -- Remove duplicates first to avoid error
        DELETE FROM messages a USING messages b
        WHERE a.id < b.id AND a.evolution_id = b.evolution_id AND a.evolution_id IS NOT NULL;

        ALTER TABLE messages ADD CONSTRAINT messages_evolution_id_key UNIQUE (evolution_id);
    END IF;
END $$;
