-- Backfill user_id for instances
UPDATE public.instances
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for contacts
UPDATE public.contacts
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for conversations
UPDATE public.conversations
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for messages
UPDATE public.messages
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for groups
UPDATE public.groups
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for group_members
UPDATE public.group_members
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for ai_analysis
UPDATE public.ai_analysis
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Backfill user_id for contact_tags
UPDATE public.contact_tags
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;
