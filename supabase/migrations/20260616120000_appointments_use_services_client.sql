-- Migration: appointments now reference services_client instead of products_services
-- This enables the new 3-level service hierarchy: Category > Service > Application

-- 1. Add new denormalization columns for filtering
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name_id UUID;

-- 2. Nullify old service_id values (they point to products_services, not services_client)
-- The denormalized service_name column already preserves the historical name
UPDATE appointments SET service_id = NULL WHERE service_id IS NOT NULL;

-- 3. Drop old FK to products_services
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;

-- 4. Add new FK to services_client
ALTER TABLE appointments ADD CONSTRAINT appointments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services_client(id) ON DELETE SET NULL;

-- 5. Update trigger to read service name from services_client
CREATE OR REPLACE FUNCTION public.set_appointment_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.service_id IS NOT NULL THEN
        SELECT name INTO NEW.service_name
        FROM services_client
        WHERE id = NEW.service_id;
    ELSE
        NEW.service_name := NULL;
    END IF;

    IF NEW.professional_id IS NOT NULL THEN
        SELECT name INTO NEW.professional_name
        FROM professionals
        WHERE id = NEW.professional_id;
    ELSE
        NEW.professional_name := NULL;
    END IF;

    RETURN NEW;
END;
$function$;
