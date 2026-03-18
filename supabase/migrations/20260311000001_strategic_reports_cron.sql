-- pg_cron jobs for strategic reports generation
-- Daily: 22:00 Brasilia = 01:00 UTC next day
SELECT cron.schedule(
  'strategic-reports-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/generate-strategic-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY"}'::jsonb,
    body := '{"frequency": "daily"}'::jsonb
  );
  $$
);

-- Weekly: Friday 22:00 Brasilia = Saturday 01:00 UTC
SELECT cron.schedule(
  'strategic-reports-weekly',
  '0 1 * * 6',
  $$
  SELECT net.http_post(
    url := 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/generate-strategic-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY"}'::jsonb,
    body := '{"frequency": "weekly"}'::jsonb
  );
  $$
);

-- Monthly: 1st day of month at 01:00 UTC
SELECT cron.schedule(
  'strategic-reports-monthly',
  '0 1 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/generate-strategic-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY"}'::jsonb,
    body := '{"frequency": "monthly"}'::jsonb
  );
  $$
);
