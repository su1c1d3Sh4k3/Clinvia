-- 1. Add status column to appointments
ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'canceled'));

-- 2. Update notifications type check
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('task_open', 'task_finished', 'deal_stagnated', 'deal_created', 'deal_stage_changed', 'queue_changed', 'appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated'));

-- 3. Create Trigger Function for Status Change
CREATE OR REPLACE FUNCTION notify_appointment_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_name TEXT;
    v_professional_name TEXT;
    v_old_status TEXT;
    v_new_status TEXT;
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Fetch names
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
        SELECT name INTO v_professional_name FROM professionals WHERE id = NEW.professional_id;
        
        v_contact_name := COALESCE(v_contact_name, 'Cliente');
        v_professional_name := COALESCE(v_professional_name, 'Profissional');
        
        -- Translate status for display
        v_old_status := CASE OLD.status
            WHEN 'pending' THEN 'Pendente'
            WHEN 'confirmed' THEN 'Confirmado'
            WHEN 'rescheduled' THEN 'Reagendado'
            WHEN 'completed' THEN 'Concluído'
            WHEN 'canceled' THEN 'Cancelado'
            ELSE OLD.status
        END;
        
        v_new_status := CASE NEW.status
            WHEN 'pending' THEN 'Pendente'
            WHEN 'confirmed' THEN 'Confirmado'
            WHEN 'rescheduled' THEN 'Reagendado'
            WHEN 'completed' THEN 'Concluído'
            WHEN 'canceled' THEN 'Cancelado'
            ELSE NEW.status
        END;

        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'appointment_updated',
            'Agendamento Atualizado',
            'Agendamento de ' || v_contact_name || ' com ' || v_professional_name || ' alterado de ' || v_old_status || ' para ' || v_new_status || '.',
            jsonb_build_object('appointment_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create Trigger
CREATE TRIGGER on_appointment_status_change
AFTER UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION notify_appointment_status_change();
