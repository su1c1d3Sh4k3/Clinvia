ALTER TABLE public.scheduling_settings
  ADD COLUMN IF NOT EXISTS notification_template TEXT;
