-- =============================================
-- Insert a NEW opportunity for testing
-- Run this to create a fresh test opportunity
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_product_id UUID;
    v_service_id UUID;
BEGIN
    -- Get the first admin user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- Get any contact that is NOT a group
    SELECT id INTO v_contact_id 
    FROM public.contacts 
    WHERE number NOT LIKE '%@g.us%' 
    ORDER BY created_at DESC
    LIMIT 1;

    -- Get any product
    SELECT id INTO v_product_id 
    FROM public.products_services 
    WHERE type = 'product'
    LIMIT 1;

    -- Get any service
    SELECT id INTO v_service_id 
    FROM public.products_services 
    WHERE type = 'service'
    LIMIT 1;

    RAISE NOTICE 'Creating opportunity with: user=%, contact=%, product=%, service=%',
        v_user_id, v_contact_id, v_product_id, v_service_id;

    -- Safety checks
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user found';
    END IF;

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'No contact found';
    END IF;

    -- Insert a SERVICE opportunity (if service exists)
    IF v_service_id IS NOT NULL THEN
        INSERT INTO public.opportunities (
            user_id,
            type,
            contact_id,
            product_service_id,
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
            CURRENT_DATE - 10,
            CURRENT_DATE - 1,
            NULL,
            NULL,
            false
        );
        RAISE NOTICE 'Created SERVICE opportunity!';
    END IF;

    -- Insert a PRODUCT opportunity (if product exists)
    IF v_product_id IS NOT NULL THEN
        INSERT INTO public.opportunities (
            user_id,
            type,
            contact_id,
            product_service_id,
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
            CURRENT_DATE - 8,
            CURRENT_DATE,
            NULL,
            NULL,
            false
        );
        RAISE NOTICE 'Created PRODUCT opportunity!';
    END IF;

    RAISE NOTICE '=== New opportunities created! Refresh the page to see them. ===';
END $$;

-- Show all active opportunities
SELECT 
    o.id,
    o.type,
    o.alert_date,
    o.dismissed,
    o.claimed_by,
    c.push_name as contact_name,
    ps.name as product_service_name
FROM public.opportunities o
LEFT JOIN public.contacts c ON o.contact_id = c.id
LEFT JOIN public.products_services ps ON o.product_service_id = ps.id
WHERE o.dismissed = false AND o.claimed_by IS NULL
ORDER BY o.created_at DESC;
