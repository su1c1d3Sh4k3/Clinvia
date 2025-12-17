-- =============================================
-- Push Notification Triggers
-- Triggers that call the send-push Edge Function when events occur
-- Date: 2025-12-17
-- =============================================

-- 1. Function to call Edge Function for push notifications
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_title TEXT;
    v_body TEXT;
    v_notification_type TEXT;
    v_url TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Get configuration from vault
    SELECT decrypted_secret INTO v_supabase_url 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    
    -- Default to environment if vault not available
    IF v_supabase_url IS NULL THEN
        v_supabase_url := 'https://swfshqvvbohnahdyndch.supabase.co';
    END IF;

    -- Determine notification details based on trigger context
    IF TG_TABLE_NAME = 'crm_deals' THEN
        -- Get the user who owns this deal
        SELECT user_id INTO v_user_id FROM crm_deals WHERE id = NEW.id;
        
        IF TG_OP = 'INSERT' THEN
            v_title := 'Novo Negócio';
            v_body := 'Negócio criado: ' || COALESCE(NEW.title, 'Sem título');
            v_notification_type := 'deals';
            v_url := '/crm';
        ELSIF TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
            v_title := 'Negócio Movido';
            v_body := 'O negócio "' || COALESCE(NEW.title, 'Sem título') || '" foi movido para outra etapa';
            v_notification_type := 'deals';
            v_url := '/crm';
        ELSE
            -- No notification needed for other updates
            RETURN NEW;
        END IF;
        
    ELSIF TG_TABLE_NAME = 'tasks' THEN
        -- Get the user who is assigned this task
        IF NEW.assigned_to IS NOT NULL THEN
            SELECT user_id INTO v_user_id FROM team_members WHERE id = NEW.assigned_to;
        ELSE
            v_user_id := NEW.user_id;
        END IF;
        
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
        v_user_id := NEW.user_id;
        
        IF TG_OP = 'INSERT' THEN
            v_title := 'Novo Agendamento';
            v_body := 'Agendamento criado para ' || to_char(NEW.start_time, 'DD/MM às HH24:MI');
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

    -- Call Edge Function via HTTP (async, don't wait)
    IF v_user_id IS NOT NULL AND v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_id', v_user_id,
                'title', v_title,
                'body', v_body,
                'notification_type', v_notification_type,
                'url', v_url
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the original operation if push fails
        RAISE WARNING 'Push notification failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create triggers for CRM deals
DROP TRIGGER IF EXISTS push_on_deal_change ON crm_deals;
CREATE TRIGGER push_on_deal_change
    AFTER INSERT OR UPDATE ON crm_deals
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

-- 3. Create triggers for tasks
DROP TRIGGER IF EXISTS push_on_task_change ON tasks;
CREATE TRIGGER push_on_task_change
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

-- 4. Create triggers for appointments
DROP TRIGGER IF EXISTS push_on_appointment_change ON appointments;
CREATE TRIGGER push_on_appointment_change
    AFTER INSERT OR UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_push_notification();

-- 5. Log success
DO $$
BEGIN
    RAISE NOTICE 'Push notification triggers created for: crm_deals, tasks, appointments';
END $$;
