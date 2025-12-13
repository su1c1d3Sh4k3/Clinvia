-- =============================================
-- Follow Up System Tables
-- =============================================

-- 1. Categories - Each attendant creates their own
CREATE TABLE IF NOT EXISTS public.follow_up_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- Owner (for RLS with get_owner_id)
    team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Templates - Messages with time delay
CREATE TABLE IF NOT EXISTS public.follow_up_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.follow_up_categories(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    time_minutes INTEGER NOT NULL CHECK (time_minutes > 0),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Conversation Follow Ups - Link ticket to category
CREATE TABLE IF NOT EXISTS public.conversation_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    category_id UUID REFERENCES public.follow_up_categories(id) ON DELETE CASCADE NOT NULL,
    last_seen_template_id UUID REFERENCES public.follow_up_templates(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Alter conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS has_follow_up BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS follow_up_notified_at TIMESTAMPTZ;

-- =============================================
-- Enable RLS
-- =============================================
ALTER TABLE public.follow_up_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_follow_ups ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies for follow_up_categories
-- =============================================
DROP POLICY IF EXISTS "Team can manage follow_up_categories" ON public.follow_up_categories;
CREATE POLICY "Team can manage follow_up_categories" ON public.follow_up_categories
    FOR ALL
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- =============================================
-- RLS Policies for follow_up_templates
-- =============================================
DROP POLICY IF EXISTS "Team can manage follow_up_templates" ON public.follow_up_templates;
CREATE POLICY "Team can manage follow_up_templates" ON public.follow_up_templates
    FOR ALL
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- =============================================
-- RLS Policies for conversation_follow_ups
-- =============================================
DROP POLICY IF EXISTS "Team can manage conversation_follow_ups" ON public.conversation_follow_ups;
CREATE POLICY "Team can manage conversation_follow_ups" ON public.conversation_follow_ups
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.follow_up_categories fc
            WHERE fc.id = category_id AND fc.user_id = get_owner_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.follow_up_categories fc
            WHERE fc.id = category_id AND fc.user_id = get_owner_id()
        )
    );

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_follow_up_categories_user_id ON public.follow_up_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_categories_team_member_id ON public.follow_up_categories(team_member_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_category_id ON public.follow_up_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_team_member_id ON public.follow_up_templates(team_member_id);
CREATE INDEX IF NOT EXISTS idx_conversation_follow_ups_conversation_id ON public.conversation_follow_ups(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_follow_ups_category_id ON public.conversation_follow_ups(category_id);
CREATE INDEX IF NOT EXISTS idx_conversations_has_follow_up ON public.conversations(has_follow_up) WHERE has_follow_up = true;

-- =============================================
-- Triggers for updated_at
-- =============================================
CREATE TRIGGER update_follow_up_categories_updated_at 
    BEFORE UPDATE ON public.follow_up_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_follow_up_templates_updated_at 
    BEFORE UPDATE ON public.follow_up_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_follow_ups_updated_at 
    BEFORE UPDATE ON public.conversation_follow_ups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
