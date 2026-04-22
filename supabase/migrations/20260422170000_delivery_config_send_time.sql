-- Per-owner configurable dispatch time. Cron now runs every 30 min; each
-- owner sets which 30-min slot their automation fires on, so dispatches are
-- spread across the day instead of all piling at 10:00 BRT.
ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS send_hour INTEGER
    CHECK (send_hour IS NULL OR (send_hour >= 0 AND send_hour <= 23)),
  ADD COLUMN IF NOT EXISTS send_minute INTEGER
    CHECK (send_minute IS NULL OR send_minute IN (0, 30));

UPDATE public.delivery_config
   SET send_hour = COALESCE(send_hour, 10),
       send_minute = COALESCE(send_minute, 0)
 WHERE ai_enabled = TRUE AND (send_hour IS NULL OR send_minute IS NULL);

CREATE INDEX IF NOT EXISTS idx_delivery_config_send_window
  ON public.delivery_config (send_hour, send_minute)
  WHERE ai_enabled = TRUE;
