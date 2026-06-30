-- =============================================================================
-- Migration: Remove CRM "Sem Contato" automation from mark_waiting_appointments
-- Agendamentos vencidos devem permanecer em "Agendado" no CRM
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_waiting_appointments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Mark overdue appointments as waiting
  UPDATE appointments
  SET status = 'waiting', updated_at = now()
  WHERE end_time < now()
    AND status IN ('pending', 'confirmed', 'rescheduled')
    AND type = 'appointment';
END;
$$;
