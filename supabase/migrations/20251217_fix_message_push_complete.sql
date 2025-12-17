-- =============================================
-- COMPLETE FIX: Message Push Notification Trigger
-- Correctly handles: auth_user_id, queues, assigned_agent
-- Date: 2025-12-17
-- =============================================

-- Drop old triggers and functions first
DROP TRIGGER IF EXISTS push_on_new_message ON messages;
DROP FUNCTION IF EXISTS trigger_message_push_notification();

-- Create the corrected function
CREATE OR REPLACE FUNCTION public.trigger_message_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_id UUID;           -- Company ID (user_id)
    v_conversation RECORD;
    v_contact_name TEXT;
    v_message_preview TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_team_member RECORD;
    v_should_notify BOOLEAN;
BEGIN
    -- Only trigger for inbound messages
    IF NEW.direction != 'inbound' THEN
        RAISE NOTICE '[PUSH] Skipping outbound message';
        RETURN NEW;
    END IF;

    RAISE NOTICE '[PUSH] Processing inbound message: %', NEW.id;

    -- Get configuration from vault
    BEGIN
        SELECT decrypted_secret INTO v_supabase_url 
        FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
        
        SELECT decrypted_secret INTO v_service_key 
        FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[PUSH] Error accessing vault: %', SQLERRM;
    END;
    
    IF v_supabase_url IS NULL THEN
        v_supabase_url := 'https://swfshqvvbohnahdyndch.supabase.co';
    END IF;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[PUSH] Service key not found in vault, cannot send notification';
        RETURN NEW;
    END IF;

    -- Get conversation details
    SELECT 
        conv.id,
        conv.user_id,
        conv.queue_id,
        conv.assigned_agent_id,
        c.push_name as contact_name
    INTO v_conversation
    FROM conversations conv
    LEFT JOIN contacts c ON conv.contact_id = c.id
    WHERE conv.id = NEW.conversation_id;

    IF v_conversation IS NULL THEN
        RAISE WARNING '[PUSH] Conversation not found: %', NEW.conversation_id;
        RETURN NEW;
    END IF;

    v_owner_id := v_conversation.user_id;
    v_contact_name := v_conversation.contact_name;

    RAISE NOTICE '[PUSH] Conversation: %, Owner: %, Queue: %, Assigned: %', 
        v_conversation.id, v_owner_id, v_conversation.queue_id, v_conversation.assigned_agent_id;

    -- Get message preview (first 50 chars)
    v_message_preview := LEFT(COALESCE(NEW.body, NEW.message_type), 50);
    IF LENGTH(COALESCE(NEW.body, '')) > 50 THEN
        v_message_preview := v_message_preview || '...';
    END IF;

    -- Send push notification based on assignment rules:
    -- 1. If conversation has assigned_agent_id -> notify ONLY that agent
    -- 2. If conversation has queue_id -> notify only team members in that queue
    -- 3. Otherwise -> notify all team members of the company
    
    IF v_conversation.assigned_agent_id IS NOT NULL THEN
        -- Conversation is assigned to a specific agent
        RAISE NOTICE '[PUSH] Notifying assigned agent: %', v_conversation.assigned_agent_id;
        
        FOR v_team_member IN 
            SELECT auth_user_id
            FROM team_members 
            WHERE id = v_conversation.assigned_agent_id
            AND auth_user_id IS NOT NULL
            AND notifications_enabled = true
        LOOP
            RAISE NOTICE '[PUSH] Sending to auth_user_id: %', v_team_member.auth_user_id;
            
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'auth_user_id', v_team_member.auth_user_id,
                    'title', COALESCE(v_contact_name, 'Nova Mensagem'),
                    'body', v_message_preview,
                    'notification_type', 'messages',
                    'url', '/inbox',
                    'tag', 'message-' || NEW.conversation_id
                )
            );
        END LOOP;
        
    ELSIF v_conversation.queue_id IS NOT NULL THEN
        -- Conversation is in a specific queue - notify only members of that queue
        RAISE NOTICE '[PUSH] Notifying queue members for queue: %', v_conversation.queue_id;
        
        FOR v_team_member IN 
            SELECT auth_user_id
            FROM team_members 
            WHERE user_id = v_owner_id
            AND auth_user_id IS NOT NULL
            AND notifications_enabled = true
            AND (
                queue_ids IS NULL 
                OR queue_ids = '{}'::uuid[] 
                OR v_conversation.queue_id = ANY(queue_ids)
            )
        LOOP
            RAISE NOTICE '[PUSH] Sending to queue member auth_user_id: %', v_team_member.auth_user_id;
            
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'auth_user_id', v_team_member.auth_user_id,
                    'title', COALESCE(v_contact_name, 'Nova Mensagem'),
                    'body', v_message_preview,
                    'notification_type', 'messages',
                    'url', '/inbox',
                    'tag', 'message-' || NEW.conversation_id
                )
            );
        END LOOP;
        
    ELSE
        -- No assignment, no queue - notify all team members of the company
        RAISE NOTICE '[PUSH] Notifying all team members for company: %', v_owner_id;
        
        FOR v_team_member IN 
            SELECT auth_user_id
            FROM team_members 
            WHERE user_id = v_owner_id
            AND auth_user_id IS NOT NULL
            AND notifications_enabled = true
        LOOP
            RAISE NOTICE '[PUSH] Sending to team member auth_user_id: %', v_team_member.auth_user_id;
            
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'auth_user_id', v_team_member.auth_user_id,
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
        RAISE WARNING '[PUSH] Message push notification failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER push_on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_message_push_notification();

-- Log success
DO $$
BEGIN
    RAISE NOTICE '[PUSH] Message push notification trigger created with queue/assignment logic';
END $$;
