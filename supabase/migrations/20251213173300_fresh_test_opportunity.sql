-- =============================================
-- Fresh opportunity for testing - December 13, 2025
-- =============================================

-- First, delete all unclaimed opportunities to start fresh
DELETE FROM public.opportunities WHERE claimed_by IS NULL;

-- Insert a new test opportunity
DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_service_id UUID;
BEGIN
    -- Get the first admin user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- Get a contact
    SELECT id INTO v_contact_id 
    FROM public.contacts 
    WHERE number NOT LIKE '%@g.us%' 
    ORDER BY created_at DESC
    LIMIT 1;

    -- Get any service
    SELECT id INTO v_service_id 
    FROM public.products_services 
    WHERE type = 'service'
    LIMIT 1;

    RAISE NOTICE 'Creating opportunity: user=%, contact=%, service=%', v_user_id, v_contact_id, v_service_id;

    -- Insert opportunity
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
    
    RAISE NOTICE 'Done!';
END $$;

-- Show result
SELECT 
    o.id,
    o.type,
    c.push_name as contact_name,
    ps.name as service_name
FROM public.opportunities o
LEFT JOIN public.contacts c ON o.contact_id = c.id
LEFT JOIN public.products_services ps ON o.product_service_id = ps.id
WHERE o.dismissed = false AND o.claimed_by IS NULL;
