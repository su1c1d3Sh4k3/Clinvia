-- Fix: Corrigir notify_queue_change para usar auth_user_id correto
-- O problema é que assigned_agent_id é team_members.id, mas related_user_id
-- espera auth.users.id (auth_user_id do team_member)

CREATE OR REPLACE FUNCTION notify_queue_change()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_name TEXT;
    v_contact_name TEXT;
    v_agent_auth_user_id UUID;
BEGIN
    IF (OLD.queue_id IS DISTINCT FROM NEW.queue_id) AND NEW.queue_id IS NOT NULL THEN
        SELECT name INTO v_queue_name FROM queues WHERE id = NEW.queue_id;
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
        
        -- Buscar o auth_user_id do agente atribuído (se existir)
        IF NEW.assigned_agent_id IS NOT NULL THEN
            SELECT auth_user_id INTO v_agent_auth_user_id 
            FROM team_members 
            WHERE id = NEW.assigned_agent_id;
        END IF;
        
        -- Só inserir notificação se o agente existir e tiver auth_user_id válido
        IF v_agent_auth_user_id IS NOT NULL THEN
            INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
            VALUES (
                'queue_changed',
                'Mudança de Fila',
                'Cliente ' || COALESCE(v_contact_name, 'Desconhecido') || ' movido para fila ' || COALESCE(v_queue_name, 'Desconhecida'),
                jsonb_build_object('conversation_id', NEW.id, 'queue_id', NEW.queue_id),
                v_agent_auth_user_id,  -- Usar auth_user_id do team_member
                NEW.user_id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
