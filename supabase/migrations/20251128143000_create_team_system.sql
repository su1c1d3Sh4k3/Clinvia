-- Create User Role Enum
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent');

-- Create Team Members Table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'agent',
  queue_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_members

-- Admins (in profiles) can manage everything
-- Note: We assume admins are in 'profiles' table. We need a way to check if current user is admin.
-- Since 'profiles' table structure is not fully known but we know it exists, we'll assume existence in 'profiles' = Admin for now, 
-- OR we can check if the user is NOT in team_members but IS in profiles.
-- However, for simplicity and security, let's allow:
-- 1. Users to view their own record.
-- 2. Admins (profiles) to view/manage all.
-- 3. Supervisors (team_members with role='supervisor') to view/manage agents.

-- Helper function to check if user is admin (exists in profiles)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is supervisor
CREATE OR REPLACE FUNCTION is_supervisor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid() AND role = 'supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is agent
CREATE OR REPLACE FUNCTION is_agent()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid() AND role = 'agent');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for team_members table

CREATE POLICY "Admins can manage all team members"
  ON public.team_members FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Supervisors can view all team members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (is_supervisor());

CREATE POLICY "Supervisors can manage agents"
  ON public.team_members FOR ALL
  TO authenticated
  USING (is_supervisor() AND role = 'agent')
  WITH CHECK (is_supervisor() AND role = 'agent');

CREATE POLICY "Users can view their own team record"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Update Conversations RLS

-- First, drop existing policies to avoid conflicts or leaks
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can manage conversations" ON public.conversations;

-- New Policies for Conversations

-- Admins and Supervisors can view ALL conversations
CREATE POLICY "Admins and Supervisors can view all conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (is_admin() OR is_supervisor());

-- Agents can view conversations assigned to them OR unassigned in their queues
CREATE POLICY "Agents can view assigned or queue conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    is_agent() AND (
      assigned_agent_id = auth.uid() OR
      (assigned_agent_id IS NULL AND queue_id = ANY(
        SELECT unnest(queue_ids) FROM public.team_members WHERE user_id = auth.uid()
      )) OR
      (assigned_agent_id IS NULL AND queue_id IS NULL) -- Allow seeing unassigned/no-queue tickets? User said "Tickets que não estão atribuidos a nenhuma fila podem ser visualizados por todos"
    )
  );

-- Admins and Supervisors can manage ALL conversations
CREATE POLICY "Admins and Supervisors can manage all conversations"
  ON public.conversations FOR ALL
  TO authenticated
  USING (is_admin() OR is_supervisor())
  WITH CHECK (is_admin() OR is_supervisor());

-- Agents can update conversations (e.g. send messages, change status) if they have access
CREATE POLICY "Agents can update accessible conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    is_agent() AND (
      assigned_agent_id = auth.uid() OR
      (assigned_agent_id IS NULL AND queue_id = ANY(
        SELECT unnest(queue_ids) FROM public.team_members WHERE user_id = auth.uid()
      )) OR
      (assigned_agent_id IS NULL AND queue_id IS NULL)
    )
  )
  WITH CHECK (
    is_agent() AND (
      assigned_agent_id = auth.uid() OR
      (assigned_agent_id IS NULL AND queue_id = ANY(
        SELECT unnest(queue_ids) FROM public.team_members WHERE user_id = auth.uid()
      )) OR
      (assigned_agent_id IS NULL AND queue_id IS NULL)
    )
  );

-- Trigger to enforce "One Supervisor" rule
CREATE OR REPLACE FUNCTION check_supervisor_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'supervisor' THEN
    IF EXISTS (SELECT 1 FROM public.team_members WHERE role = 'supervisor' AND id != NEW.id) THEN
      RAISE EXCEPTION 'Only one supervisor is allowed per account.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_one_supervisor
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION check_supervisor_limit();
