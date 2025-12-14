-- Migration: Add sign_messages column to team_members table
-- This column controls whether the agent's name is appended to messages sent to clients
-- Default is TRUE (enabled)

ALTER TABLE team_members 
ADD COLUMN IF NOT EXISTS sign_messages BOOLEAN DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN team_members.sign_messages IS 'Whether to append agent name to messages. Default is TRUE.';
