-- Business rule: when ia_config.ia_on = TRUE for a given owner, the Clinvia AI
-- already handles appointment communications. ALL appointment auto_messages
-- (Confirmação, Lembrete, Cancelamento, Pós-atendimento etc.) must therefore
-- be suppressed — otherwise the client receives duplicate messages.
-- This mirrors the warning banner shown in /auto-messages → aba "Agenda".

CREATE OR REPLACE FUNCTION public.trigger_appointment_auto_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  auto_msg RECORD;
  service_key TEXT;
  supabase_url TEXT := 'https://swfshqvvbohnahdyndch.supabase.co';
  trigger_type_val TEXT;
  ia_enabled BOOLEAN;
BEGIN
  -- Skip delivery-automation-created appointments (own flow handles confirmation).
  IF NEW.description IS NOT NULL
     AND NEW.description LIKE 'Agendado automaticamente via Delivery Automation%' THEN
    RETURN NEW;
  END IF;

  -- Skip when Clinvia AI is enabled for this owner.
  SELECT ia_on INTO ia_enabled FROM ia_config WHERE user_id = NEW.user_id LIMIT 1;
  IF COALESCE(ia_enabled, FALSE) = TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    trigger_type_val := 'appointment_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'canceled' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      trigger_type_val := 'appointment_cancelled';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO auto_msg FROM auto_messages
  WHERE user_id = NEW.user_id AND trigger_type = trigger_type_val AND is_active = true
  LIMIT 1;
  IF auto_msg.id IS NULL THEN RETURN NEW; END IF;

  service_key := current_setting('supabase.service_role_key', true);
  IF service_key IS NULL OR service_key = '' THEN
    SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;
  IF service_key IS NULL OR service_key = '' THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-auto-messages',
    headers := jsonb_build_object('Authorization','Bearer '||service_key,'Content-Type','application/json'),
    body := jsonb_build_object(
      'trigger_type', trigger_type_val,
      'entity_id', NEW.id,
      'auto_message_id', auto_msg.id
    ),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
END;
$function$;
