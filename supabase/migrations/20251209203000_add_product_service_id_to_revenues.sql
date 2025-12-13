-- Add product_service_id column to revenues table
-- This links revenue records to the product/service that generated the revenue

ALTER TABLE public.revenues
ADD COLUMN IF NOT EXISTS product_service_id UUID REFERENCES public.products_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_revenues_product_service_id ON public.revenues(product_service_id);

COMMENT ON COLUMN public.revenues.product_service_id IS 'Links revenue to product/service from products_services table';
