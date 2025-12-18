-- =============================================
-- Instagram Integration - Database Schema Changes
-- Date: 2025-12-18
-- =============================================

-- 1. Add channel column to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp' 
CHECK (channel IN ('whatsapp', 'instagram'));

-- 2. Add instagram_id to contacts for Instagram user ID
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS instagram_id TEXT;

-- 3. Add channel column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp' 
CHECK (channel IN ('whatsapp', 'instagram'));

-- 4. Add instagram_notifications_enabled to team_members
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS instagram_notifications_enabled BOOLEAN DEFAULT true;

-- 5. Create instagram_instances table for multiple Instagram accounts
CREATE TABLE IF NOT EXISTS public.instagram_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    instagram_account_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_channel ON public.contacts(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations(channel);
CREATE INDEX IF NOT EXISTS idx_contacts_instagram_id ON public.contacts(instagram_id);
CREATE INDEX IF NOT EXISTS idx_instagram_instances_user_id ON public.instagram_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_instances_account_id ON public.instagram_instances(instagram_account_id);

-- 7. Enable RLS on instagram_instances
ALTER TABLE public.instagram_instances ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for instagram_instances
CREATE POLICY "Users can view own instagram instances"
    ON public.instagram_instances
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own instagram instances"
    ON public.instagram_instances
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own instagram instances"
    ON public.instagram_instances
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own instagram instances"
    ON public.instagram_instances
    FOR DELETE
    USING (auth.uid() = user_id);

-- 9. Add instagram_instance_id to conversations (link to Instagram account)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS instagram_instance_id UUID REFERENCES public.instagram_instances(id) ON DELETE SET NULL;

-- 10. Add instagram_instance_id to contacts (link to Instagram account)
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS instagram_instance_id UUID REFERENCES public.instagram_instances(id) ON DELETE SET NULL;

-- 11. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_instagram_instance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Trigger for updated_at
DROP TRIGGER IF EXISTS instagram_instances_updated_at ON public.instagram_instances;
CREATE TRIGGER instagram_instances_updated_at
    BEFORE UPDATE ON public.instagram_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_instagram_instance_timestamp();

-- 13. Comments
COMMENT ON TABLE public.instagram_instances IS 'Instagram Business accounts connected to the platform';
COMMENT ON COLUMN public.contacts.channel IS 'Message channel: whatsapp or instagram';
COMMENT ON COLUMN public.contacts.instagram_id IS 'Instagram-scoped user ID (IGSID)';
COMMENT ON COLUMN public.conversations.channel IS 'Conversation channel: whatsapp or instagram';
COMMENT ON COLUMN public.team_members.instagram_notifications_enabled IS 'Enable push notifications for Instagram messages';

-- 14. Log success
DO $$
BEGIN
    RAISE NOTICE 'Instagram integration schema changes applied successfully';
END $$;
