-- Add user_id to instances
ALTER TABLE public.instances
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to contacts
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to messages
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to ai_analysis
ALTER TABLE public.ai_analysis
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to contact_tags
ALTER TABLE public.contact_tags
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update RLS Policies for instances
DROP POLICY IF EXISTS "Authenticated users can view instances" ON public.instances;
DROP POLICY IF EXISTS "Authenticated users can manage instances" ON public.instances;

CREATE POLICY "Users can view their own instances"
ON public.instances FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own instances"
ON public.instances FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update RLS Policies for contacts
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can manage contacts" ON public.contacts;

CREATE POLICY "Users can view their own contacts"
ON public.contacts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own contacts"
ON public.contacts FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update RLS Policies for conversations
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can manage conversations" ON public.conversations;

CREATE POLICY "Users can view their own conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own conversations"
ON public.conversations FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update RLS Policies for messages
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;

CREATE POLICY "Users can view their own messages"
ON public.messages FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own messages"
ON public.messages FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update RLS Policies for ai_analysis
DROP POLICY IF EXISTS "Authenticated users can view ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "Authenticated users can manage ai_analysis" ON public.ai_analysis;

CREATE POLICY "Users can view their own ai_analysis"
ON public.ai_analysis FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own ai_analysis"
ON public.ai_analysis FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update RLS Policies for contact_tags
DROP POLICY IF EXISTS "Users can view their own contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can insert their own contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can delete their own contact tags" ON public.contact_tags;

CREATE POLICY "Users can view their own contact tags"
ON public.contact_tags FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own contact tags"
ON public.contact_tags FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
