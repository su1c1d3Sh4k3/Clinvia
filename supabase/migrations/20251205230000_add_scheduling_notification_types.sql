ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('task_open', 'task_finished', 'deal_stagnated', 'deal_created', 'deal_stage_changed', 'queue_changed', 'appointment_created', 'appointments_today', 'appointment_reminder'));
