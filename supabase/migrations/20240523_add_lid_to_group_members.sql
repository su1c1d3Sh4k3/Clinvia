-- Add lid column to group_members table
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS lid text;

-- Add index for lid lookup (optional but good for performance if we query by lid)
CREATE INDEX IF NOT EXISTS idx_group_members_lid ON group_members(lid);
