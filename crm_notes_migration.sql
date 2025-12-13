-- Add notes column to crm_deals table
ALTER TABLE public.crm_deals
ADD COLUMN notes JSONB DEFAULT '[]'::jsonb;

-- Comment on column
COMMENT ON COLUMN public.crm_deals.notes IS 'Array of objects: { data: string, usuario: string, nota: string }';
