-- Migration: Conversation Uniqueness Constraint
-- Ensures only one active (open/pending) conversation per contact per user_id
-- This prevents duplicate tickets for the same customer

-- Partial unique index for contacts: only one active conversation per contact per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_active_per_contact
ON public.conversations (contact_id, user_id)
WHERE status IN ('open', 'pending') AND contact_id IS NOT NULL;

-- Partial unique index for groups: only one active conversation per group per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_active_per_group
ON public.conversations (group_id, user_id)
WHERE status IN ('open', 'pending') AND group_id IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_conversations_unique_active_per_contact IS 
'Ensures only one open/pending conversation per contact per user_id. Prevents duplicate tickets.';

COMMENT ON INDEX idx_conversations_unique_active_per_group IS 
'Ensures only one open/pending conversation per group per user_id. Prevents duplicate tickets.';
