-- =============================================
-- Setup pg_cron to call process-auto-follow-up every 2 minutes
-- =============================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to invoke the edge function
CREATE OR REPLACE FUNCTION invoke_auto_follow_up()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    response text;
BEGIN
    -- Call the Edge Function via HTTP
    SELECT content::text INTO response
    FROM http_post(
        current_setting('app.settings.supabase_url') || '/functions/v1/process-auto-follow-up',
        '',
        'application/json',
        ARRAY[
            ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
            ('Content-Type', 'application/json')
        ]
    );
    
    RAISE NOTICE 'Auto Follow Up Response: %', response;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error invoking auto follow up: %', SQLERRM;
END;
$$;

-- Schedule the job to run every 2 minutes
-- Note: pg_cron needs to be installed on the database
SELECT cron.schedule(
    'process-auto-follow-up',     -- job name
    '*/2 * * * *',                -- every 2 minutes
    $$SELECT invoke_auto_follow_up()$$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION invoke_auto_follow_up() TO service_role;
