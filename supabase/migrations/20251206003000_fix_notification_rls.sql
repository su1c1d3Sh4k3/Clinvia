-- Set SECURITY DEFINER on notification trigger functions to bypass RLS for system-generated notifications

ALTER FUNCTION notify_appointment_status_change SECURITY DEFINER;
ALTER FUNCTION notify_task_change SECURITY DEFINER;
ALTER FUNCTION notify_deal_change SECURITY DEFINER;
ALTER FUNCTION notify_queue_change SECURITY DEFINER;
