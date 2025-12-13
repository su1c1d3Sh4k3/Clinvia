-- Add service_ids column to professionals table
-- This column stores an array of product_service IDs that the professional can perform

ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS service_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN public.professionals.service_ids IS 'Array of product_service IDs that this professional can perform';
