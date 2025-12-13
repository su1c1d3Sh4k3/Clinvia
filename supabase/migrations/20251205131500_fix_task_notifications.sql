-- Fix task notifications: Add task_created type and update trigger to handle INSERT

-- 1. Update check constraint for notifications type
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('task_created', 'task_open', 'task_finished', 'deal_stagnated', 'deal_created', 'deal_stage_changed', 'queue_changed'));

-- 2. Update notify_task_change function to handle INSERT
CREATE OR REPLACE FUNCTION notify_task_change()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := NEW.user_id; 

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'task_created',
            'Nova Tarefa: ' || NEW.title,
            'Uma nova tarefa "' || NEW.title || '" foi criada.',
            jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
            v_user_id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.status = 'open' AND (OLD.status IS DISTINCT FROM 'open') THEN
            INSERT INTO notifications (type, title, description, metadata, related_user_id)
            VALUES (
                'task_open',
                'Tarefa Aberta: ' || NEW.title,
                'A tarefa "' || NEW.title || '" foi iniciada.',
                jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
                v_user_id
            );
        ELSIF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN
            INSERT INTO notifications (type, title, description, metadata, related_user_id)
            VALUES (
                'task_finished',
                'Tarefa Concluída: ' || NEW.title,
                'A tarefa "' || NEW.title || '" foi finalizada.',
                jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
                v_user_id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update trigger to fire on INSERT OR UPDATE
DROP TRIGGER IF EXISTS on_task_status_change ON tasks;
CREATE TRIGGER on_task_status_change
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_change();
