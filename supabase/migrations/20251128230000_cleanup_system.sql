-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function to delete old resolved tickets
CREATE OR REPLACE FUNCTION cleanup_old_tickets()
RETURNS void AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM public.conversations
    WHERE status = 'resolved'
    AND created_at < (now() - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old resolved tickets.', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule the job to run daily at 03:00 AM
-- We use UNSCHEDULE first to avoid duplicates if re-running migration
SELECT cron.unschedule('cleanup-tickets-daily');

SELECT cron.schedule(
    'cleanup-tickets-daily', -- name of the cron job
    '0 3 * * *',             -- schedule (3 AM daily)
    'SELECT cleanup_old_tickets()'
);
