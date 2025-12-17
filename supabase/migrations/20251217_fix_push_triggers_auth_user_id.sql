-- =============================================
-- FIX: Push Notification Triggers
-- Correctly uses auth_user_id for push subscriptions
-- Date: 2025-12-17
-- =============================================

-- 1. FIXED Function for CRM/Tasks/Appointments push notifications
-- Sends to ALL team_members of the company with notifications enabled
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_id UUID;  -- The company/owner (user_id column)
    v_title TEXT;
    v_body TEXT;
    v_notification_type TEXT;
    v_url TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_team_member RECORD;
BEGIN
    -- Get configuration from vault
    SELECT decrypted_secret INTO v_supabase_url 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    
    IF v_supabase_url IS NULL THEN
        v_supabase_url := 'https://swfshqvvbohnahdyndch.supabase.co';
    END IF;

    -- Determine notification details based on trigger context
    IF TG_TABLE_NAME = 'crm_deals' THEN
        v_owner_id := NEW.user_id;  -- Company ID
        
        IF TG_OP = 'INSERT' THEN
            v_title := 'Novo Negócio';
            v_body := 'Negócio criado: ' || COALESCE(NEW.title, 'Sem título');
            v_notification_type := 'deals';
            v_url := '/crm';
        ELSIF TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
            v_title := 'Negócio Movido';
            v_body := 'O negócio "' || COALESCE(NEW.title, 'Sem título') || '" foi movido';
            v_notification_type := 'deals';
            v_url := '/crm';
        ELSE
            RETURN NEW;
        END IF;
        
    ELSIF TG_TABLE_NAME = 'tasks' THEN
        v_owner_id := NEW.user_id;  -- Company ID
        
        IF TG_OP = 'INSERT' THEN
            v_title := 'Nova Tarefa';
            v_body := COALESCE(NEW.title, 'Tarefa sem título');
            v_notification_type := 'tasks';
            v_url := '/tasks';
        ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
            v_title := 'Tarefa Atualizada';
            v_body := 'Status alterado: ' || COALESCE(NEW.title, 'Tarefa');
            v_notification_type := 'tasks';
            v_url := '/tasks';
        ELSE
            RETURN NEW;
        END IF;
        
    ELSIF TG_TABLE_NAME = 'appointments' THEN
        v_owner_id := NEW.user_id;  -- Company ID
        
        IF TG_OP = 'INSERT' THEN
            v_title := 'Novo Agendamento';
            v_body := 'Agendamento para ' || to_char(NEW.start_time, 'DD/MM às HH24:MI');
            v_notification_type := 'appointments';
            v_url := '/scheduling';
        ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
            v_title := 'Agendamento Atualizado';
            v_body := 'Status: ' || NEW.status;
            v_notification_type := 'appointments';
            v_url := '/scheduling';
        ELSE
            RETURN NEW;
        END IF;
    ELSE
        RETURN NEW;
    END IF;

    -- Send notification to ALL team_members of this company
    -- The push_subscriptions table uses auth_user_id
    IF v_owner_id IS NOT NULL AND v_service_key IS NOT NULL THEN
        FOR v_team_member IN 
            SELECT auth_user_id, push_notification_preferences
            FROM team_members 
            WHERE user_id = v_owner_id
            AND auth_user_id IS NOT NULL
            AND notifications_enabled = true
        LOOP
            -- Check if this notification type is enabled for this team member
            IF v_team_member.push_notification_preferences IS NOT NULL 
               AND (v_team_member.push_notification_preferences->>v_notification_type)::boolean = true THEN
                
                PERFORM net.http_post(
                    url := v_supabase_url || '/functions/v1/send-push',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || v_service_key
                    ),
                    body := jsonb_build_object(
                        'auth_user_id', v_team_member.auth_user_id,  -- Use auth_user_id!
                        'title', v_title,
                        'body', v_body,
                        'notification_type', v_notification_type,
                        'url', v_url
                    )
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. FIXED Function for Message push notifications
-- Sends to ALL team_members of the company when a new message arrives
CREATE OR REPLACE FUNCTION public.trigger_message_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_id UUID;  -- Company ID
    v_contact_name TEXT;
    v_message_preview TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_team_member RECORD;
BEGIN
    -- Only trigger for inbound messages
    IF NEW.direction != 'inbound' THEN
        RETURN NEW;
    END IF;

    -- Get configuration from vault
    SELECT decrypted_secret INTO v_supabase_url 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    
    IF v_supabase_url IS NULL THEN
        v_supabase_url := 'https://swfshqvvbohnahdyndch.supabase.co';
    END IF;

    -- Get contact name from conversation
    SELECT c.push_name INTO v_contact_name
    FROM conversations conv
    JOIN contacts c ON conv.contact_id = c.id
    WHERE conv.id = NEW.conversation_id;

    -- Get message preview (first 50 chars)
    v_message_preview := LEFT(COALESCE(NEW.body, NEW.message_type), 50);
    IF LENGTH(COALESCE(NEW.body, '')) > 50 THEN
        v_message_preview := v_message_preview || '...';
    END IF;

    -- Get owner_id (company) from conversation
    SELECT user_id INTO v_owner_id FROM conversations WHERE id = NEW.conversation_id;

    -- Send push notification to ALL team_members of this company
    -- Message notifications are ALWAYS sent (no preference check needed as per user request)
    IF v_owner_id IS NOT NULL AND v_service_key IS NOT NULL THEN
        FOR v_team_member IN 
            SELECT auth_user_id
            FROM team_members 
            WHERE user_id = v_owner_id
            AND auth_user_id IS NOT NULL
            AND notifications_enabled = true
        LOOP
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'auth_user_id', v_team_member.auth_user_id,  -- Use auth_user_id!
                    'title', COALESCE(v_contact_name, 'Nova Mensagem'),
                    'body', v_message_preview,
                    'notification_type', 'messages',
                    'url', '/inbox',
                    'tag', 'message-' || NEW.conversation_id
                )
            );
        END LOOP;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Message push notification failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Recreate triggers
DROP TRIGGER IF EXISTS push_on_deal_change ON crm_deals;
CREATE TRIGGER push_on_deal_change
    AFTER INSERT OR UPDATE ON crm_deals
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

DROP TRIGGER IF EXISTS push_on_task_change ON tasks;
CREATE TRIGGER push_on_task_change
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

DROP TRIGGER IF EXISTS push_on_appointment_change ON appointments;
CREATE TRIGGER push_on_appointment_change
    AFTER INSERT OR UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

DROP TRIGGER IF EXISTS push_on_new_message ON messages;
CREATE TRIGGER push_on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_message_push_notification();

-- Log success
DO $$
BEGIN
    RAISE NOTICE 'Push notification triggers FIXED - now using auth_user_id correctly';
END $$;
