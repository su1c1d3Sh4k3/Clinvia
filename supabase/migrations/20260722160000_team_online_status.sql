-- Monitoramento dashboard: online status of team members.
-- active_sessions has RLS limited to own row; this SECURITY DEFINER RPC
-- exposes only team member heartbeats within the caller's owner scope.

CREATE OR REPLACE FUNCTION public.get_team_online_status()
RETURNS TABLE(team_member_id UUID, last_heartbeat_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT tm.id AS team_member_id, s.last_heartbeat_at
FROM team_members tm
LEFT JOIN active_sessions s ON s.auth_user_id = tm.auth_user_id
WHERE tm.user_id = public.get_owner_id();
$$;

GRANT EXECUTE ON FUNCTION public.get_team_online_status() TO authenticated;
