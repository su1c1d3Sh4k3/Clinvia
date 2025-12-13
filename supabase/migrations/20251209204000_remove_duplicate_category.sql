-- Remove duplicate category "Serviços" - keep only "Serviço"
-- First, update any revenues using "Serviços" to use "Serviço" instead

-- Find the correct "Serviço" category id
DO $$
DECLARE
    correct_category_id UUID;
    duplicate_category_id UUID;
BEGIN
    -- Get the correct category id
    SELECT id INTO correct_category_id FROM revenue_categories WHERE name = 'Serviço' LIMIT 1;
    
    -- Get the duplicate category id
    SELECT id INTO duplicate_category_id FROM revenue_categories WHERE name = 'Serviços' LIMIT 1;
    
    -- If both exist, migrate revenues and delete duplicate
    IF correct_category_id IS NOT NULL AND duplicate_category_id IS NOT NULL THEN
        -- Update revenues to use correct category
        UPDATE revenues SET category_id = correct_category_id WHERE category_id = duplicate_category_id;
        
        -- Delete the duplicate
        DELETE FROM revenue_categories WHERE id = duplicate_category_id;
    END IF;
    
    -- If only duplicate exists (no correct one), rename it
    IF correct_category_id IS NULL AND duplicate_category_id IS NOT NULL THEN
        UPDATE revenue_categories SET name = 'Serviço' WHERE id = duplicate_category_id;
    END IF;
END $$;
