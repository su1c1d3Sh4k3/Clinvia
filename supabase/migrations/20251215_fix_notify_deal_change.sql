-- Fix notify_deal_change() function
-- Problem: responsible_id is team_member.id, but notifications.related_user_id expects auth.users.id

CREATE OR REPLACE FUNCTION public.notify_deal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_contact_name TEXT;
    v_stage_name TEXT;
    v_responsible_auth_id UUID;
BEGIN
    -- Get contact name
    SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
    v_contact_name := COALESCE(v_contact_name, 'Cliente');
    
    -- Get the auth_user_id from team_members (not the team_member.id itself)
    IF NEW.responsible_id IS NOT NULL THEN
        SELECT auth_user_id INTO v_responsible_auth_id 
        FROM team_members 
        WHERE id = NEW.responsible_id;
    END IF;
    
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'deal_created',
            'Nova Negociação',
            'Nova negociação criada para ' || v_contact_name,
            jsonb_build_object('deal_id', NEW.id, 'value', NEW.value),
            v_responsible_auth_id, -- Use resolved auth_user_id
            NEW.user_id
        );
    ELSIF (TG_OP = 'UPDATE') AND (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        SELECT name INTO v_stage_name FROM crm_stages WHERE id = NEW.stage_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'deal_stage_changed',
            'Mudança de Fase',
            'Negociação de ' || v_contact_name || ' moveu para ' || COALESCE(v_stage_name, 'nova fase'),
            jsonb_build_object('deal_id', NEW.id, 'stage_id', NEW.stage_id),
            v_responsible_auth_id, -- Use resolved auth_user_id
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$;
