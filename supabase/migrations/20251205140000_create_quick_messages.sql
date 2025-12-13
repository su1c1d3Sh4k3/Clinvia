
-- Create quick_messages table
CREATE TABLE IF NOT EXISTS quick_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shortcut TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'audio', 'video')),
    content TEXT,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_quick_messages_user_id ON quick_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_messages_shortcut ON quick_messages(shortcut);

-- Enable RLS
ALTER TABLE quick_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own quick messages"
    ON quick_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quick messages"
    ON quick_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quick messages"
    ON quick_messages FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quick messages"
    ON quick_messages FOR DELETE
    USING (auth.uid() = user_id);

-- Create storage bucket for quick messages media if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('quick-messages', 'quick-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Quick Messages Media Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'quick-messages' );

CREATE POLICY "Users can upload quick messages media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'quick-messages' AND
    auth.uid() = owner
);

CREATE POLICY "Users can update their own quick messages media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'quick-messages' AND
    auth.uid() = owner
);

CREATE POLICY "Users can delete their own quick messages media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'quick-messages' AND
    auth.uid() = owner
);
