-- Add instance_id to groups table
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL;

-- Rename remote_jid to number in group_members table
ALTER TABLE public.group_members
RENAME COLUMN remote_jid TO number;

-- Recreate index for the renamed column
DROP INDEX IF EXISTS idx_group_members_remote_jid;
CREATE INDEX IF NOT EXISTS idx_group_members_number ON public.group_members(number);

-- Update unique constraint
ALTER TABLE public.group_members
DROP CONSTRAINT IF EXISTS group_members_group_id_remote_jid_key;

ALTER TABLE public.group_members
ADD CONSTRAINT group_members_group_id_number_key UNIQUE (group_id, number);
