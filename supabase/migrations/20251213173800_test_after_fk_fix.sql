-- =============================================
-- Fresh opportunity after FK fix - December 13, 2025
-- =============================================

DELETE FROM public.opportunities WHERE claimed_by IS NULL;

DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_service_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    SELECT id INTO v_contact_id 
    FROM public.contacts 
    WHERE number NOT LIKE '%@g.us%' 
    ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO v_service_id 
    FROM public.products_services WHERE type = 'service' LIMIT 1;

    INSERT INTO public.opportunities (
        user_id, type, contact_id, product_service_id,
        reference_date, alert_date, assigned_to, claimed_by, dismissed
    ) VALUES (
        v_user_id, 'service', v_contact_id, v_service_id,
        CURRENT_DATE - 10, CURRENT_DATE - 1, NULL, NULL, false
    );
    
    RAISE NOTICE 'Opportunity created!';
END $$;

SELECT o.id, c.push_name as contact, ps.name as service
FROM public.opportunities o
LEFT JOIN public.contacts c ON o.contact_id = c.id
LEFT JOIN public.products_services ps ON o.product_service_id = ps.id
WHERE o.dismissed = false AND o.claimed_by IS NULL;
