-- =============================================
-- Sample data for testing Opportunities feature
-- =============================================

-- IMPORTANT: This script uses existing data from your database
-- It creates sample products/services and appointments/revenues for testing

DO $$
DECLARE
    v_user_id UUID;
    v_contact_id UUID;
    v_professional_id UUID;
    v_product_id UUID;
    v_service_id UUID;
    v_appointment_id UUID;
    v_revenue_id UUID;
    v_reference_date DATE := CURRENT_DATE - INTERVAL '7 days'; -- 7 days ago
BEGIN
    -- Get the first admin user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No users found in the database';
    END IF;

    -- Get an existing contact (not a group)
    SELECT id INTO v_contact_id 
    FROM public.contacts 
    WHERE number NOT LIKE '%@g.us%' 
    LIMIT 1;

    IF v_contact_id IS NULL THEN
        -- Create a sample contact if none exists
        INSERT INTO public.contacts (remote_jid, push_name, number)
        VALUES ('5511999999999@s.whatsapp.net', 'Cliente Teste Oportunidade', '5511999999999')
        RETURNING id INTO v_contact_id;
    END IF;

    -- Create or get a professional
    SELECT id INTO v_professional_id FROM public.professionals WHERE user_id = v_user_id LIMIT 1;
    
    IF v_professional_id IS NULL THEN
        INSERT INTO public.professionals (user_id, name, role)
        VALUES (v_user_id, 'Profissional Teste', 'Especialista')
        RETURNING id INTO v_professional_id;
    END IF;

    -- =============================================
    -- 1. Create a PRODUCT with opportunity_alert_days = 5
    -- =============================================
    INSERT INTO public.products_services (user_id, type, name, description, price, opportunity_alert_days)
    VALUES (v_user_id, 'product', 'Shampoo Premium', 'Shampoo profissional para cabelos', 89.90, 5)
    RETURNING id INTO v_product_id;

    RAISE NOTICE 'Created product: %', v_product_id;

    -- =============================================
    -- 2. Create a SERVICE with opportunity_alert_days = 3
    -- =============================================
    INSERT INTO public.products_services (user_id, type, name, description, price, duration_minutes, opportunity_alert_days)
    VALUES (v_user_id, 'service', 'Corte de Cabelo', 'Corte masculino ou feminino', 50.00, 30, 3)
    RETURNING id INTO v_service_id;

    -- Update professional to include this service
    UPDATE public.professionals 
    SET service_ids = ARRAY[v_service_id]
    WHERE id = v_professional_id;

    RAISE NOTICE 'Created service: %', v_service_id;

    -- =============================================
    -- 3. Create a COMPLETED APPOINTMENT (from 7 days ago)
    -- This should trigger a service opportunity (7 > 3 days)
    -- =============================================
    INSERT INTO public.appointments (
        user_id, 
        professional_id, 
        contact_id, 
        service_id, 
        start_time, 
        end_time, 
        price, 
        status,
        type
    )
    VALUES (
        v_user_id,
        v_professional_id,
        v_contact_id,
        v_service_id,
        v_reference_date + INTERVAL '10 hours',
        v_reference_date + INTERVAL '10 hours 30 minutes',
        50.00,
        'completed',
        'appointment'
    )
    RETURNING id INTO v_appointment_id;

    RAISE NOTICE 'Created completed appointment: %', v_appointment_id;

    -- =============================================
    -- 4. Create a PAID REVENUE for the product (from 7 days ago)
    -- This should trigger a product opportunity (7 > 5 days)
    -- =============================================
    
    -- First, get or create a "Produto" revenue category
    DECLARE
        v_category_id UUID;
    BEGIN
        SELECT id INTO v_category_id 
        FROM public.revenue_categories 
        WHERE LOWER(name) = 'produto' OR LOWER(name) = 'produtos'
        LIMIT 1;

        IF v_category_id IS NULL THEN
            INSERT INTO public.revenue_categories (user_id, name)
            VALUES (v_user_id, 'Produtos')
            RETURNING id INTO v_category_id;
        END IF;

        INSERT INTO public.revenues (
            user_id,
            category_id,
            item,
            description,
            amount,
            payment_method,
            due_date,
            paid_date,
            status,
            product_service_id,
            contact_id
        )
        VALUES (
            v_user_id,
            v_category_id,
            'Shampoo Premium',
            'Venda de produto para cliente teste',
            89.90,
            'pix',
            v_reference_date,
            v_reference_date,
            'paid',
            v_product_id,
            v_contact_id
        )
        RETURNING id INTO v_revenue_id;

        RAISE NOTICE 'Created paid revenue: %', v_revenue_id;
    END;

    RAISE NOTICE '=== Sample data created successfully! ===';
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE 'Contact ID: %', v_contact_id;
    RAISE NOTICE 'Product ID: %', v_product_id;
    RAISE NOTICE 'Service ID: %', v_service_id;
    RAISE NOTICE 'Appointment ID: %', v_appointment_id;
    RAISE NOTICE 'Revenue ID: %', v_revenue_id;
END $$;
