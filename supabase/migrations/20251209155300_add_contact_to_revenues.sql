-- Add contact_id to revenues table for CRM-Financial integration
-- This allows linking revenues to contacts/clients from CRM deals

-- Add contact_id column
ALTER TABLE public.revenues
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_revenues_contact ON public.revenues(contact_id);

-- Add comment for documentation
COMMENT ON COLUMN public.revenues.contact_id IS 'Reference to the contact/client associated with this revenue. Populated automatically when revenue is created from a CRM deal.';
