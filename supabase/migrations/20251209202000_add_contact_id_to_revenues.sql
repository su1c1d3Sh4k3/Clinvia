-- Add contact_id column to revenues table for CRM integration
-- This links revenue records to contacts from the CRM

ALTER TABLE public.revenues
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.revenues.contact_id IS 'Links revenue to CRM contact (from deals)';
