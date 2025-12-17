-- =============================================
-- Message Push Notification Trigger
-- Sends push notification when new messages arrive
-- Date: 2025-12-17
-- =============================================

-- Function to trigger push for new messages
CREATE OR REPLACE FUNCTION public.trigger_message_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
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
    
    -- Default URL if vault not available
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

    -- Get user_id from conversation
    SELECT user_id INTO v_user_id FROM conversations WHERE id = NEW.conversation_id;

    -- Check if notifications are enabled for this user
    SELECT * INTO v_team_member 
    FROM team_members 
    WHERE user_id = v_user_id 
    AND notifications_enabled = true
    LIMIT 1;

    IF v_team_member IS NULL THEN
        -- Notifications disabled for this user
        RETURN NEW;
    END IF;

    -- Send push notification
    IF v_user_id IS NOT NULL AND v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_id', v_user_id,
                'title', COALESCE(v_contact_name, 'Nova Mensagem'),
                'body', v_message_preview,
                'notification_type', 'messages',
                'url', '/inbox',
                'tag', 'message-' || NEW.conversation_id
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the original operation if push fails
        RAISE WARNING 'Message push notification failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new messages
DROP TRIGGER IF EXISTS push_on_new_message ON messages;
CREATE TRIGGER push_on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_message_push_notification();

-- Update send-push to check for 'messages' type in preferences
-- Note: The Edge Function already checks push_notification_preferences

-- Log success
DO $$
BEGIN
    RAISE NOTICE 'Message push notification trigger created';
END $$;
