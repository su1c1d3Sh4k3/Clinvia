-- =============================================
-- Insert sample opportunities directly for testing
-- Run this after the sample data migration
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_professional_id UUID;
    v_product_id UUID;
    v_service_id UUID;
    v_appointment_id UUID;
    v_revenue_id UUID;
BEGIN
    -- Get the first admin user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- Get the sample contact
    SELECT id INTO v_contact_id 
    FROM public.contacts 
    WHERE push_name = 'Cliente Teste Oportunidade'
    OR number = '5511999999999'
    LIMIT 1;

    -- If no sample contact, get any contact
    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id 
        FROM public.contacts 
        WHERE number NOT LIKE '%@g.us%' 
        LIMIT 1;
    END IF;

    -- Get the sample product (Shampoo Premium)
    SELECT id INTO v_product_id 
    FROM public.products_services 
    WHERE name = 'Shampoo Premium' AND type = 'product'
    LIMIT 1;

    -- Get the sample service (Corte de Cabelo)
    SELECT id INTO v_service_id 
    FROM public.products_services 
    WHERE name = 'Corte de Cabelo' AND type = 'service'
    LIMIT 1;

    -- Get a professional
    SELECT id INTO v_professional_id FROM public.professionals LIMIT 1;

    -- Get a completed appointment
    SELECT id INTO v_appointment_id 
    FROM public.appointments 
    WHERE status = 'completed' 
    LIMIT 1;

    -- Get a paid revenue with product
    SELECT id INTO v_revenue_id 
    FROM public.revenues 
    WHERE status = 'paid' AND product_service_id IS NOT NULL
    LIMIT 1;

    RAISE NOTICE 'IDs found: user=%, contact=%, product=%, service=%, professional=%, appointment=%, revenue=%',
        v_user_id, v_contact_id, v_product_id, v_service_id, v_professional_id, v_appointment_id, v_revenue_id;

    -- Safety checks
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user found';
    END IF;

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'No contact found';
    END IF;

    -- =============================================
    -- Insert SERVICE OPPORTUNITY
    -- =============================================
    IF v_service_id IS NOT NULL THEN
        INSERT INTO public.opportunities (
            user_id,
            type,
            contact_id,
            product_service_id,
            professional_id,
            appointment_id,
            reference_date,
            alert_date,
            assigned_to,
            claimed_by,
            dismissed
        )
        VALUES (
            v_user_id,
            'service',
            v_contact_id,
            v_service_id,
            v_professional_id,
            v_appointment_id,
            CURRENT_DATE - 7,  -- 7 days ago
            CURRENT_DATE - 4,  -- Alert date (7-3=4 days ago, so alert is active)
            NULL,              -- Not assigned, visible to all
            NULL,              -- Not claimed
            false              -- Not dismissed
        )
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Service opportunity created!';
    ELSE
        RAISE NOTICE 'No service found, skipping service opportunity';
    END IF;

    -- =============================================
    -- Insert PRODUCT OPPORTUNITY
    -- =============================================
    IF v_product_id IS NOT NULL THEN
        INSERT INTO public.opportunities (
            user_id,
            type,
            contact_id,
            product_service_id,
            professional_id,
            revenue_id,
            reference_date,
            alert_date,
            assigned_to,
            claimed_by,
            dismissed
        )
        VALUES (
            v_user_id,
            'product',
            v_contact_id,
            v_product_id,
            NULL,              -- No professional for product
            v_revenue_id,
            CURRENT_DATE - 7,  -- 7 days ago
            CURRENT_DATE - 2,  -- Alert date (7-5=2 days ago, so alert is active)
            NULL,              -- Not assigned, visible to all
            NULL,              -- Not claimed
            false              -- Not dismissed
        )
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Product opportunity created!';
    ELSE
        RAISE NOTICE 'No product found, skipping product opportunity';
    END IF;

    RAISE NOTICE '=== Opportunities created successfully! ===';
END $$;

-- Verify the opportunities were created
SELECT 
    o.id,
    o.type,
    o.reference_date,
    o.alert_date,
    c.push_name as contact_name,
    ps.name as product_service_name
FROM public.opportunities o
LEFT JOIN public.contacts c ON o.contact_id = c.id
LEFT JOIN public.products_services ps ON o.product_service_id = ps.id
ORDER BY o.created_at DESC;
