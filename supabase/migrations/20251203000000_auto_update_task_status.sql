-- Function to update task status based on time
CREATE OR REPLACE FUNCTION update_task_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If task is pending and start_time has passed, set to open
    IF NEW.status = 'pending' AND NEW.start_time <= NOW() THEN
        NEW.status := 'open';
    END IF;

    -- If task is open (or pending) and end_time has passed, set to finished
    IF (NEW.status = 'pending' OR NEW.status = 'open') AND NEW.end_time <= NOW() THEN
        NEW.status := 'finished';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run on INSERT or UPDATE
DROP TRIGGER IF EXISTS trigger_update_task_status ON tasks;
CREATE TRIGGER trigger_update_task_status
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_task_status();

-- We also need a way to periodically check tasks, as the trigger only runs on modification.
-- Since we can't easily set up pg_cron here without extensions, we will rely on
-- the frontend or an edge function to trigger updates, OR we can create a function
-- that can be called via RPC to update all tasks.

CREATE OR REPLACE FUNCTION update_all_task_statuses()
RETURNS void AS $$
BEGIN
    UPDATE tasks
    SET status = CASE
        WHEN status = 'pending' AND start_time <= NOW() AND end_time > NOW() THEN 'open'
        WHEN (status = 'pending' OR status = 'open') AND end_time <= NOW() THEN 'finished'
        ELSE status
    END
    WHERE status IN ('pending', 'open');
END;
$$ LANGUAGE plpgsql;
