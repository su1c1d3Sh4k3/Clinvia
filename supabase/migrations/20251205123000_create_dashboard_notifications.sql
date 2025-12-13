-- Create notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('task_open', 'task_finished', 'deal_stagnated', 'deal_created', 'deal_stage_changed', 'queue_changed')),
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    related_user_id UUID REFERENCES auth.users(id), -- The user this is most relevant to (e.g. assignee)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notification_dismissals table
CREATE TABLE notification_dismissals (
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dismissals ENABLE ROW LEVEL SECURITY;

-- Policies for notifications
-- Admins and Supervisors can view all notifications (that they haven't dismissed)
-- Agents can view notifications where related_user_id is them (that they haven't dismissed)
-- We will handle the "dismissed" filtering in the query or a view, but for RLS, we allow access to the base record.

CREATE POLICY "Admins and Supervisors view all"
    ON notifications FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
    );

CREATE POLICY "Agents view their own"
    ON notifications FOR SELECT
    TO authenticated
    USING (
        related_user_id = auth.uid() OR related_user_id IS NULL
    );

-- Policies for notification_dismissals
CREATE POLICY "Users can insert their own dismissals"
    ON notification_dismissals FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own dismissals"
    ON notification_dismissals FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Helper function to get user name
CREATE OR REPLACE FUNCTION get_profile_name(p_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT full_name INTO v_name FROM profiles WHERE id = p_id;
    RETURN COALESCE(v_name, 'Usuário');
END;
$$ LANGUAGE plpgsql;

-- 1. Trigger for Tasks
CREATE OR REPLACE FUNCTION notify_task_change()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := NEW.user_id; -- Default to creator, but maybe should be assignee if we had one. Tasks table has allowed_agents (array).
    -- For now, let's notify the creator.

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
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_task_status_change
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_change();

-- 2. Trigger for CRM Deals
CREATE OR REPLACE FUNCTION notify_deal_change()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_name TEXT;
    v_stage_name TEXT;
BEGIN
    -- Get contact name
    SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
    v_contact_name := COALESCE(v_contact_name, 'Cliente');

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_created',
            'Nova Negociação',
            'Nova negociação criada para ' || v_contact_name,
            jsonb_build_object('deal_id', NEW.id, 'value', NEW.value),
            NEW.responsible_id -- Notify the responsible agent
        );
    ELSIF (TG_OP = 'UPDATE') AND (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        -- Get new stage name
        SELECT name INTO v_stage_name FROM crm_stages WHERE id = NEW.stage_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_stage_changed',
            'Mudança de Fase',
            'Negociação de ' || v_contact_name || ' moveu para ' || COALESCE(v_stage_name, 'nova fase'),
            jsonb_build_object('deal_id', NEW.id, 'stage_id', NEW.stage_id),
            NEW.responsible_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_deal_created_or_moved
AFTER INSERT OR UPDATE ON crm_deals
FOR EACH ROW
EXECUTE FUNCTION notify_deal_change();

-- 3. Trigger for Queue Changes
CREATE OR REPLACE FUNCTION notify_queue_change()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_name TEXT;
    v_contact_name TEXT;
BEGIN
    IF (OLD.queue_id IS DISTINCT FROM NEW.queue_id) AND NEW.queue_id IS NOT NULL THEN
        SELECT name INTO v_queue_name FROM queues WHERE id = NEW.queue_id;
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'queue_changed',
            'Mudança de Fila',
            'Cliente ' || COALESCE(v_contact_name, 'Desconhecido') || ' movido para fila ' || COALESCE(v_queue_name, 'Desconhecida'),
            jsonb_build_object('conversation_id', NEW.id, 'queue_id', NEW.queue_id),
            NEW.assigned_agent_id -- Notify assigned agent if any
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_conversation_queue_change
AFTER UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION notify_queue_change();

-- 4. RPC for Stagnation Check
CREATE OR REPLACE FUNCTION check_crm_stagnation()
RETURNS void AS $$
DECLARE
    r RECORD;
    v_contact_name TEXT;
BEGIN
    -- Find deals that are in a stage with stagnation_limit_days > 0
    -- AND have been in that stage (stage_changed_at) for longer than the limit
    -- AND we haven't already notified about this stagnation recently (to avoid spam, we could check if a notification exists created recently? 
    -- For simplicity, let's just insert. The frontend can deduplicate or we can check existence).
    
    FOR r IN 
        SELECT d.id, d.name, d.responsible_id, d.stage_changed_at, s.stagnation_limit_days, s.name as stage_name, d.contact_id
        FROM crm_deals d
        JOIN crm_stages s ON d.stage_id = s.id
        WHERE s.stagnation_limit_days > 0
        AND d.status = 'open'
        AND d.stage_changed_at < NOW() - (s.stagnation_limit_days || ' days')::INTERVAL
        -- Avoid creating duplicate notifications for the same stagnation event today
        AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.type = 'deal_stagnated' 
            AND (n.metadata->>'deal_id')::UUID = d.id
            AND n.created_at > NOW() - INTERVAL '24 hours'
        )
    LOOP
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = r.contact_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_stagnated',
            'Negociação Estagnada',
            'Negociação com ' || COALESCE(v_contact_name, r.name) || ' está parada na fase ' || r.stage_name || ' há mais de ' || r.stagnation_limit_days || ' dias.',
            jsonb_build_object('deal_id', r.id, 'days_stagnated', EXTRACT(DAY FROM NOW() - r.stage_changed_at)),
            r.responsible_id
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;
