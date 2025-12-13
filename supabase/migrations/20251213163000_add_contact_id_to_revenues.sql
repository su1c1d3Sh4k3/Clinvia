-- =============================================
-- Add contact_id to revenues table
-- =============================================

ALTER TABLE public.revenues
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_revenues_contact_id ON public.revenues(contact_id);

-- Comment
COMMENT ON COLUMN public.revenues.contact_id IS 'Links revenue to a contact, mainly used for product sales opportunities';
