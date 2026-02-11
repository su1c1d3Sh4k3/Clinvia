-- Migration: Add default queues (Suporte and Financeiro) for all users
-- These queues cannot be deleted or modified
-- Created: 2026-02-10

-- Add is_system column to queues table to mark system/default queues
ALTER TABLE queues ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- Create function to add default queues for existing and new users
CREATE OR REPLACE FUNCTION create_default_queues_for_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert Suporte queue if it doesn't exist
    INSERT INTO queues (user_id, name, is_active, is_system)
    SELECT p_user_id, 'Suporte', TRUE, TRUE
    WHERE NOT EXISTS (
        SELECT 1 FROM queues 
        WHERE user_id = p_user_id 
        AND name = 'Suporte' 
        AND is_system = TRUE
    );

    -- Insert Financeiro queue if it doesn't exist
    INSERT INTO queues (user_id, name, is_active, is_system)
    SELECT p_user_id, 'Financeiro', TRUE, TRUE
    WHERE NOT EXISTS (
        SELECT 1 FROM queues 
        WHERE user_id = p_user_id 
        AND name = 'Financeiro' 
        AND is_system = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add default queues for all existing users
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT DISTINCT id FROM auth.users LOOP
        PERFORM create_default_queues_for_user(user_record.id);
    END LOOP;
END $$;

-- Create trigger to add default queues for new users automatically
CREATE OR REPLACE FUNCTION add_default_queues_on_user_creation()
RETURNS TRIGGER AS $$
BEGIN
    -- Add default queues for the new user
    PERFORM create_default_queues_for_user(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_add_default_queues_on_user_creation ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER trigger_add_default_queues_on_user_creation
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION add_default_queues_on_user_creation();

-- Add policy to prevent deletion of system queues
CREATE POLICY "Cannot delete system queues" ON queues
    FOR DELETE
    USING (is_system = FALSE);

-- Add policy to prevent updating system queues' name or is_system flag
CREATE POLICY "Cannot modify system queues core fields" ON queues
    FOR UPDATE
    USING (
        CASE 
            WHEN is_system = TRUE THEN 
                -- System queues can only have is_active and auto_assign modified
                FALSE
            ELSE 
                TRUE
        END
    );

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_default_queues_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_default_queues_on_user_creation() TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Default queues migration completed successfully';
    RAISE NOTICE 'Added Suporte and Financeiro queues for all users';
    RAISE NOTICE 'System queues are now protected from deletion and modification';
END $$;
