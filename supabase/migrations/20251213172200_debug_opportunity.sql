-- =============================================
-- Insert a NEW opportunity for testing DEBUG
-- Run this after previous tests
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_service_id UUID;
BEGIN
    -- Get the first admin user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- Get a contact that has NO open/pending conversations
    SELECT c.id INTO v_contact_id 
    FROM public.contacts c
    WHERE c.number NOT LIKE '%@g.us%'
    AND NOT EXISTS (
        SELECT 1 FROM public.conversations conv 
        WHERE conv.contact_id = c.id 
        AND conv.status IN ('open', 'pending')
    )
    ORDER BY c.created_at DESC
    LIMIT 1;

    -- If all contacts have active conversations, just get any contact
    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id 
        FROM public.contacts 
        WHERE number NOT LIKE '%@g.us%' 
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- Get any service
    SELECT id INTO v_service_id 
    FROM public.products_services 
    WHERE type = 'service'
    LIMIT 1;

    RAISE NOTICE 'Creating DEBUG opportunity with: user=%, contact=%, service=%',
        v_user_id, v_contact_id, v_service_id;

    -- Delete existing non-claimed opportunities for this contact (to clean up)
    DELETE FROM public.opportunities 
    WHERE contact_id = v_contact_id 
    AND claimed_by IS NULL;

    -- Insert a fresh SERVICE opportunity
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
    
    RAISE NOTICE '=== DEBUG opportunity created! Refresh browser and check console (F12) when clicking ===';
END $$;

-- Show the opportunity just created
SELECT 
    o.id as opportunity_id,
    o.type,
    o.contact_id,
    c.push_name as contact_name,
    ps.name as service_name,
    o.alert_date,
    o.dismissed,
    o.claimed_by
FROM public.opportunities o
LEFT JOIN public.contacts c ON o.contact_id = c.id
LEFT JOIN public.products_services ps ON o.product_service_id = ps.id
WHERE o.dismissed = false AND o.claimed_by IS NULL
ORDER BY o.created_at DESC
LIMIT 5;
