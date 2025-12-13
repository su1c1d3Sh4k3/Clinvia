-- Add product/service relationship to CRM deals
-- This migration adds support for linking deals to products/services with quantity tracking

-- Step 1: Add new columns to crm_deals
ALTER TABLE public.crm_deals
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS product_service_id UUID REFERENCES public.products_services(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Step 2: Drop old product column (user confirmed data can be discarded)
ALTER TABLE public.crm_deals
DROP COLUMN IF EXISTS product;

-- Step 3: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_crm_deals_product_service ON public.crm_deals(product_service_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned_professional ON public.crm_deals(assigned_professional_id);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN public.crm_deals.quantity IS 'Number of units for the product/service in this deal';
COMMENT ON COLUMN public.crm_deals.product_service_id IS 'Reference to products_services table';
COMMENT ON COLUMN public.crm_deals.assigned_professional_id IS 'Professional assigned to this service (only for service-type deals)';
