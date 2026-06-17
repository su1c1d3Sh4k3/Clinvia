-- Fix: add 'waiting' and 'no-show' to appointment status check constraint
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status = ANY (ARRAY['pending', 'confirmed', 'rescheduled', 'completed', 'canceled', 'waiting', 'no-show']));
