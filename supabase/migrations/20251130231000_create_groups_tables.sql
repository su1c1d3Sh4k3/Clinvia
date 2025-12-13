-- Create groups table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    group_name TEXT,
    remote_jid TEXT UNIQUE NOT NULL,
    group_pic_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create group_members table
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    push_name TEXT,
    profile_pic_url TEXT,
    remote_jid TEXT NOT NULL, -- JID of the member
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, remote_jid)
);

-- Add group_id to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- Make contact_id nullable in conversations (since groups won't have a contact_id)
ALTER TABLE public.conversations
ALTER COLUMN contact_id DROP NOT NULL;

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Policies for groups
CREATE POLICY "Enable read access for all users" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.groups FOR UPDATE USING (true);

-- Policies for group_members
CREATE POLICY "Enable read access for all users" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.group_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.group_members FOR UPDATE USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_remote_jid ON public.groups(remote_jid);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_remote_jid ON public.group_members(remote_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON public.conversations(group_id);
