-- =============================================
-- ENABLE TRIGGER ALWAYS
-- tgenabled = 'O' means origin mode, need 'ENABLE ALWAYS' for all sessions
-- Date: 2025-12-17
-- =============================================

-- Enable trigger for ALL types of sessions including replicas and service roles
ALTER TABLE messages ENABLE ALWAYS TRIGGER push_on_new_message;

-- Verify
DO $$
DECLARE
    v_enabled TEXT;
BEGIN
    SELECT tgenabled INTO v_enabled 
    FROM pg_trigger 
    WHERE tgname = 'push_on_new_message';
    
    RAISE NOTICE 'Trigger push_on_new_message enabled status: %', v_enabled;
    -- 'A' = ALWAYS, 'O' = ORIGIN, 'D' = DISABLED, 'R' = REPLICA
END $$;
