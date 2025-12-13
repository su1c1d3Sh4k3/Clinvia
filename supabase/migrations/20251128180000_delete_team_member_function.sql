-- Create a function to safely cleanup team member data before deletion
-- This function unassigns their tickets and removes them from team_members

CREATE OR REPLACE FUNCTION cleanup_team_member_data(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 1. Unassign tickets (set assigned_agent_id to NULL)
  -- Only for tickets currently assigned to this user
  UPDATE public.conversations
  SET assigned_agent_id = NULL
  WHERE assigned_agent_id = target_user_id;

  -- 2. Delete from team_members table
  DELETE FROM public.team_members
  WHERE user_id = target_user_id;

  -- 3. Delete from profiles (if exists)
  DELETE FROM public.profiles
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
