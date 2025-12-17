-- =============================================
-- Helper function to trigger push notifications
-- Can be called from other triggers/functions
-- Date: 2025-12-17
-- =============================================

-- Function to send push notification via Edge Function
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id UUID,
    p_title TEXT,
    p_body TEXT,
    p_notification_type TEXT DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_tag TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Call the Edge Function to send push notification
    SELECT content::jsonb INTO v_result
    FROM extensions.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push',
        body := jsonb_build_object(
            'user_id', p_user_id,
            'title', p_title,
            'body', p_body,
            'notification_type', p_notification_type,
            'url', p_url,
            'tag', p_tag
        )::text,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
    
    RAISE NOTICE 'Push notification sent: %', v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to send push notification: %', SQLERRM;
END;
$$;

-- Example trigger to send push on task creation
-- This can be enabled/disabled as needed

/*
CREATE OR REPLACE FUNCTION notify_task_push()
RETURNS TRIGGER AS $$
BEGIN
    -- Send push notification when a task is assigned
    IF NEW.assigned_to IS NOT NULL THEN
        PERFORM send_push_notification(
            (SELECT user_id FROM team_members WHERE id = NEW.assigned_to),
            'Nova Tarefa',
            'Você recebeu uma nova tarefa: ' || NEW.title,
            'tasks',
            '/tasks',
            'task-' || NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_push_notification
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_push();
*/

-- Log success
DO $$
BEGIN
    RAISE NOTICE 'Push notification helper function created successfully';
END $$;
