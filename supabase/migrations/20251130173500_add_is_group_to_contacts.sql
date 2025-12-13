-- Add is_group column to contacts table
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_contacts_is_group ON public.contacts(is_group);
