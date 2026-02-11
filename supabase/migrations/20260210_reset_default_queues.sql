-- Migration: Reset and create new default queues system
-- This migration:
-- 1. Adds is_locked field to queues
-- 2. Drops all existing queues
-- 3. Creates 5 new default queues for all users
-- 4. Updates RLS policies to prevent editing/deleting locked queues
-- 5. Adds trigger to insert transfer message when queue changes

-- 1. Add is_locked field
ALTER TABLE queues
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- 2. First, set all conversations.queue_id to NULL to avoid foreign key constraint
UPDATE conversations SET queue_id = NULL;

-- 3. Now drop all existing queues
DELETE FROM queues;

-- 4. Update function to create 5 default queues
CREATE OR REPLACE FUNCTION create_default_queues()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO queues (user_id, name, is_active, is_default, is_locked)
    VALUES 
        (NEW.id, 'Atendimento IA', true, true, true),
        (NEW.id, 'Atendimento Humano', true, true, true),
        (NEW.id, 'Cliente Ativo', true, true, true),
        (NEW.id, 'Delivery', true, true, true),
        (NEW.id, 'Pós Venda', true, true, true);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill for existing users
DO $$
DECLARE
    profile_record RECORD;
BEGIN
    FOR profile_record IN SELECT id FROM profiles LOOP
        -- Create 5 default queues for each existing user
        INSERT INTO queues (user_id, name, is_active, is_default, is_locked)
        VALUES 
            (profile_record.id, 'Atendimento IA', true, true, true),
            (profile_record.id, 'Atendimento Humano', true, true, true),
            (profile_record.id, 'Cliente Ativo', true, true, true),
            (profile_record.id, 'Delivery', true, true, true),
            (profile_record.id, 'Pós Venda', true, true, true);
    END LOOP;
END;
$$;

-- 6. Update RLS policies to prevent editing/deleting locked queues
DROP POLICY IF EXISTS "Users can update their own queues" ON queues;
CREATE POLICY "Users can update their own queues" ON queues
    FOR UPDATE USING (auth.uid() = user_id AND is_locked = false);

DROP POLICY IF EXISTS "Users can delete their own queues" ON queues;
CREATE POLICY "Users can delete their own queues" ON queues
    FOR DELETE USING (auth.uid() = user_id AND is_locked = false);

-- 7. Create function to insert transfer message when queue changes
CREATE OR REPLACE FUNCTION insert_transfer_message()
RETURNS TRIGGER AS $$
DECLARE
    v_old_queue_name TEXT;
    v_new_queue_name TEXT;
    v_message_body TEXT;
BEGIN
    -- Only proceed if queue_id actually changed
    IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
        -- Get old queue name
        IF OLD.queue_id IS NOT NULL THEN
            SELECT name INTO v_old_queue_name FROM queues WHERE id = OLD.queue_id;
        END IF;
        
        -- Get new queue name
        IF NEW.queue_id IS NOT NULL THEN
            SELECT name INTO v_new_queue_name FROM queues WHERE id = NEW.queue_id;
        END IF;
        
        -- Create transfer message
        v_message_body := format(
            'Conversa %s transferida de %s para %s',
            substring(NEW.id::text, 1, 8),
            COALESCE(v_old_queue_name, 'Sem fila'),
            COALESCE(v_new_queue_name, 'Sem fila')
        );
        
        -- Insert system message
        INSERT INTO messages (
            conversation_id, 
            user_id, 
            body, 
            message_type, 
            direction
        ) VALUES (
            NEW.id,
            NEW.user_id,
            v_message_body,
            'text',
            'outbound'  -- System messages use 'outbound' direction
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for queue transfer messages
DROP TRIGGER IF EXISTS on_queue_transfer ON conversations;
CREATE TRIGGER on_queue_transfer
AFTER UPDATE ON conversations
FOR EACH ROW
WHEN (OLD.queue_id IS DISTINCT FROM NEW.queue_id)
EXECUTE FUNCTION insert_transfer_message();

-- 9. Update RLS policy for conversations (role-based access)
-- This ensures:
-- - Admins and Supervisors see all conversations from their account
-- - Agents see only: assigned to them OR pending unassigned
DROP POLICY IF EXISTS "Team members can view conversations based on role" ON conversations;
CREATE POLICY "Team members can view conversations based on role"
ON conversations FOR SELECT
TO authenticated
USING (
    -- Get the team member record for current auth user
    EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
        AND tm.user_id = conversations.user_id
        AND (
            -- Admin or Supervisor: see all conversations from same owner
            tm.role IN ('admin', 'supervisor')
            OR
            -- Agent: see assigned to them OR pending unassigned
            (
                tm.role = 'agent'
                AND (
                    conversations.assigned_agent_id = tm.id
                    OR (conversations.assigned_agent_id IS NULL AND conversations.status = 'pending')
                )
            )
        )
    )
);

-- 10. Add comment for documentation
COMMENT ON COLUMN queues.is_locked IS 'Indica se a fila é imutável (não pode ser editada/deletada). Usado para filas padrão.';
