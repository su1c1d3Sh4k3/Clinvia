-- Bulletproof inbound dispatch: DB trigger on messages INSERT invokes the
-- respond edge function when the inbound belongs to a contact with an
-- ACTIVE delivery_automation_session. Removes reliance on the JS intercept
-- in webhook-handle-message.

CREATE OR REPLACE FUNCTION public.trigger_delivery_automation_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
    v_contact_id UUID;
    v_user_id UUID;
    v_session_id UUID;
    v_session_state TEXT;
    v_service_key TEXT;
    v_supabase_url TEXT;
BEGIN
    IF NEW.direction::text <> 'inbound' THEN RETURN NEW; END IF;
    IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

    SELECT c.contact_id, c.user_id INTO v_contact_id, v_user_id
    FROM public.conversations c WHERE c.id = NEW.conversation_id LIMIT 1;
    IF v_contact_id IS NULL THEN RETURN NEW; END IF;

    SELECT das.id, das.state INTO v_session_id, v_session_state
    FROM public.delivery_automation_sessions das
    WHERE das.contact_id = v_contact_id
      AND das.state NOT IN ('completed','transferred','abandoned','failed')
    ORDER BY das.created_at DESC
    LIMIT 1;
    IF v_session_id IS NULL THEN RETURN NEW; END IF;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    IF v_service_key IS NULL OR v_supabase_url IS NULL THEN RETURN NEW; END IF;

    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/delivery-automation-respond',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'conversationId', NEW.conversation_id,
            'contactId', v_contact_id,
            'userId', v_user_id,
            'rawMessage', COALESCE(NEW.body, ''),
            'buttonText', COALESCE(NEW.body, ''),
            'buttonId', NULL,
            'messageId', NEW.id
        ),
        timeout_milliseconds := 15000
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'delivery-automation inbound trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_automation_on_inbound ON public.messages;
CREATE TRIGGER trg_delivery_automation_on_inbound
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_delivery_automation_on_inbound();

GRANT EXECUTE ON FUNCTION public.trigger_delivery_automation_on_inbound() TO service_role;
