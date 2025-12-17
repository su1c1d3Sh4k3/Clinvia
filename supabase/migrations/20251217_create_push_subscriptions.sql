-- =============================================
-- PWA Push Notifications Setup
-- Create tables for push subscriptions and notification preferences
-- Date: 2025-12-17
-- =============================================

-- 1. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_type TEXT DEFAULT 'desktop' CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Unique constraint on endpoint to prevent duplicates
    CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

-- 2. Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- 3. Add notification preferences to team_members if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' 
        AND column_name = 'push_notification_preferences'
    ) THEN
        ALTER TABLE public.team_members 
        ADD COLUMN push_notification_preferences JSONB DEFAULT '{
            "messages": true,
            "tasks": false,
            "deals": false,
            "appointments": false,
            "financial": false,
            "opportunities": false
        }'::jsonb;
    END IF;
END $$;

-- 4. Enable RLS on push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for push_subscriptions

-- Users can view their own subscriptions
CREATE POLICY "Users can view own push subscriptions"
    ON public.push_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own push subscriptions"
    ON public.push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own push subscriptions"
    ON public.push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions"
    ON public.push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger for updated_at
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscription_timestamp();

-- 8. Log success
DO $$
BEGIN
    RAISE NOTICE 'Push subscriptions table and notification preferences created successfully';
END $$;
