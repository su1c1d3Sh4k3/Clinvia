-- Create enum for conversation status
CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'resolved');

-- Create enum for message types
CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'video', 'document');

-- Create enum for message direction
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Create enum for instance status
CREATE TYPE instance_status AS ENUM ('connected', 'disconnected');

-- Table: instances (Evolution API connections)
CREATE TABLE public.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  apikey TEXT NOT NULL,
  status instance_status DEFAULT 'disconnected',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: contacts (WhatsApp customers)
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_jid TEXT UNIQUE NOT NULL,
  push_name TEXT,
  profile_pic_url TEXT,
  custom_attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: conversations (Tickets)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status conversation_status DEFAULT 'open',
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  body TEXT,
  media_url TEXT,
  message_type message_type DEFAULT 'text',
  direction message_direction NOT NULL,
  evolution_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: ai_analysis
CREATE TABLE public.ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  sentiment_score NUMERIC(3,1) CHECK (sentiment_score >= 0 AND sentiment_score <= 10),
  summary TEXT,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for instances
CREATE POLICY "Authenticated users can view instances"
  ON public.instances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage instances"
  ON public.instances FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for contacts
CREATE POLICY "Authenticated users can view contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage contacts"
  ON public.contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for conversations
CREATE POLICY "Authenticated users can view conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage conversations"
  ON public.conversations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for messages
CREATE POLICY "Authenticated users can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for ai_analysis
CREATE POLICY "Authenticated users can view ai_analysis"
  ON public.ai_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage ai_analysis"
  ON public.ai_analysis FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_assigned_agent ON public.conversations(assigned_agent_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Enable Realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();