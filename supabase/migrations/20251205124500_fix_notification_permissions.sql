-- Fix RLS violation by making notification functions SECURITY DEFINER
-- This allows the functions to insert into the notifications table even if the user doesn't have direct INSERT permissions.

-- 1. Trigger for Tasks
CREATE OR REPLACE FUNCTION notify_task_change()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := NEW.user_id; 

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. RPC for Stagnation Check
CREATE OR REPLACE FUNCTION check_crm_stagnation()
RETURNS void AS $$
DECLARE
    r RECORD;
    v_contact_name TEXT;
BEGIN
    FOR r IN 
        SELECT d.id, d.name, d.responsible_id, d.stage_changed_at, s.stagnation_limit_days, s.name as stage_name, d.contact_id
        FROM crm_deals d
        JOIN crm_stages s ON d.stage_id = s.id
        WHERE s.stagnation_limit_days > 0
        AND d.status = 'open'
        AND d.stage_changed_at < NOW() - (s.stagnation_limit_days || ' days')::INTERVAL
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
