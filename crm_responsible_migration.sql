-- Add responsible_id to crm_deals table
ALTER TABLE public.crm_deals
ADD COLUMN responsible_id UUID REFERENCES auth.users(id);

-- Add index for better performance
CREATE INDEX idx_crm_deals_responsible_id ON public.crm_deals(responsible_id);
