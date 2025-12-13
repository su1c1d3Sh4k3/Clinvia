-- =============================================
-- Fix: Use pg_net extension instead of http for calling edge functions
-- =============================================

-- Enable pg_net extension (available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the old function
DROP FUNCTION IF EXISTS invoke_auto_follow_up();

-- Create new function using pg_net
CREATE OR REPLACE FUNCTION invoke_auto_follow_up()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    supabase_url text;
    service_key text;
BEGIN
    -- Get environment settings
    supabase_url := 'https://swfshqvvbohnahdyndch.supabase.co';
    service_key := current_setting('supabase.service_role_key', true);
    
    -- If service_key is null, try to get from vault
    IF service_key IS NULL THEN
        -- Fallback: Just log that we couldn't get the key
        RAISE NOTICE 'Service role key not available, skipping auto follow up processing';
        RETURN;
    END IF;

    -- Use pg_net to make HTTP request
    PERFORM net.http_post(
        url := supabase_url || '/functions/v1/process-auto-follow-up',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || service_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    
    RAISE NOTICE 'Auto Follow Up request sent';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error invoking auto follow up: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION invoke_auto_follow_up() TO service_role;
GRANT EXECUTE ON FUNCTION invoke_auto_follow_up() TO postgres;
