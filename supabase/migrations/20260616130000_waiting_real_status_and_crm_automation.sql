-- =============================================================================
-- Migration: waiting as real DB status + pg_cron + CRM automation on waiting
-- =============================================================================

-- 1. pg_cron function: mark overdue appointments as 'waiting'
--    AND move their CRM cards to 'Sem Contato' with priority 'high'
CREATE OR REPLACE FUNCTION public.mark_waiting_appointments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Mark overdue appointments as waiting
  UPDATE appointments
  SET status = 'waiting', updated_at = now()
  WHERE end_time < now()
    AND status IN ('pending', 'confirmed', 'rescheduled')
    AND type = 'appointment';

  -- Move CRM cards to 'Sem Contato' + priority high for contacts with waiting appointments
  FOR rec IN
    SELECT DISTINCT a.contact_id
    FROM appointments a
    WHERE a.status = 'waiting'
      AND a.contact_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM crm_client cc
        WHERE cc.contact_id = a.contact_id
          AND cc.is_active = true
          AND cc.stage = 'Agendado'
      )
  LOOP
    UPDATE crm_client
    SET stage = 'Sem Contato',
        priority = 'high',
        stage_changed_at = now(),
        updated_at = now()
    WHERE contact_id = rec.contact_id
      AND is_active = true
      AND stage = 'Agendado';
  END LOOP;
END;
$$;

-- Schedule: every 10 minutes
SELECT cron.schedule(
  'mark-waiting-appointments',
  '*/10 * * * *',
  'SELECT public.mark_waiting_appointments()'
);
