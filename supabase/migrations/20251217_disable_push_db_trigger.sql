-- =============================================
-- Disable database push trigger
-- The webhook-handle-message Edge Function handles push notifications
-- This prevents duplicate notifications
-- Date: 2025-12-17
-- =============================================

-- Disable the database trigger that was sending duplicate push notifications
-- The Edge Function webhook-handle-message already handles this with proper role-based logic
ALTER TABLE messages DISABLE TRIGGER push_on_new_message;

-- Log the change
DO $$
BEGIN
    RAISE NOTICE 'Disabled push_on_new_message trigger - Edge Function handles push notifications now';
END $$;
