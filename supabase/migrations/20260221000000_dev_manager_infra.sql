-- =============================================
-- Dev Manager Infrastructure Tables
-- Created: 2026-02-21
-- Tables: infra_metrics, system_config, alert_log
-- RPC: get_database_stats, cleanup_infra_metrics
-- =============================================

-- 1. infra_metrics: stores snapshots collected by infra-collector every 10min
CREATE TABLE IF NOT EXISTS public.infra_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collected_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- n8n metrics
  n8n_active_workflows INTEGER DEFAULT 0,
  n8n_failed_executions INTEGER DEFAULT 0,
  n8n_recent_errors JSONB DEFAULT '[]'::jsonb,
  n8n_reachable BOOLEAN DEFAULT true,

  -- Portainer container metrics
  containers JSONB DEFAULT '[]'::jsonb,
  total_containers INTEGER DEFAULT 0,
  running_containers INTEGER DEFAULT 0,
  stopped_containers INTEGER DEFAULT 0,
  avg_cpu_percent NUMERIC(5,2) DEFAULT 0,
  avg_memory_percent NUMERIC(5,2) DEFAULT 0,
  portainer_reachable BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_infra_metrics_collected_at ON public.infra_metrics(collected_at DESC);

ALTER TABLE public.infra_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_infra_metrics" ON public.infra_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
  );

CREATE POLICY "service_role_infra_metrics" ON public.infra_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Auto-purge function: delete rows older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_infra_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.infra_metrics WHERE collected_at < now() - INTERVAL '30 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_infra_metrics() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_infra_metrics() FROM PUBLIC;


-- 2. system_config: key/value config store (URLs + thresholds only — no secrets)
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_system_config" ON public.system_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
  );

CREATE POLICY "service_role_system_config" ON public.system_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default config values
INSERT INTO public.system_config (key, value) VALUES
  ('portainer_url', 'https://painel.clinvia.com.br/'),
  ('n8n_url', 'https://workflows.clinvia.com.br/'),
  ('admin_wa_number', ''),
  ('cpu_threshold', '80'),
  ('memory_threshold', '85'),
  ('n8n_error_threshold', '5')
ON CONFLICT (key) DO NOTHING;

-- Trigger: update updated_at on change
CREATE OR REPLACE FUNCTION public.update_system_config_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_config_updated_at ON public.system_config;
CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.update_system_config_timestamp();


-- 3. alert_log: infrastructure alert history
CREATE TABLE IF NOT EXISTS public.alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  -- n8n_error | container_cpu | container_memory | container_down
  -- wa_disconnected | instagram_expired | ticket_urgent | portainer_down | n8n_down
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_created_at ON public.alert_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_severity ON public.alert_log(severity);
CREATE INDEX IF NOT EXISTS idx_alert_log_type ON public.alert_log(type);
CREATE INDEX IF NOT EXISTS idx_alert_log_resolved ON public.alert_log(resolved);

ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_alert_log" ON public.alert_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
  );

CREATE POLICY "service_role_alert_log" ON public.alert_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 4. RPC: get_database_stats — service_role only
CREATE OR REPLACE FUNCTION public.get_database_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'active_connections', (
      SELECT count(*) FROM pg_stat_activity WHERE state = 'active'
    ),
    'total_connections', (
      SELECT count(*) FROM pg_stat_activity
    ),
    'idle_connections', (
      SELECT count(*) FROM pg_stat_activity WHERE state = 'idle'
    ),
    'db_size_mb', (
      SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)
    ),
    'cache_hit_ratio', (
      SELECT round(
        100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0),
        2
      )
      FROM pg_statio_user_tables
    ),
    'table_sizes', (
      SELECT json_agg(t) FROM (
        SELECT
          schemaname || '.' || tablename AS "table",
          round(pg_total_relation_size(schemaname || '.' || tablename) / 1024.0 / 1024.0, 2) AS size_mb
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
        LIMIT 10
      ) t
    ),
    'longest_running_query_ms', (
      SELECT round(extract(epoch FROM max(now() - query_start)) * 1000)
      FROM pg_stat_activity
      WHERE state = 'active' AND query_start IS NOT NULL
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_database_stats() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_database_stats() FROM PUBLIC;


-- =============================================
-- pg_cron setup instructions
-- Run the following manually in Supabase SQL editor AFTER deployment.
-- Replace CRON_SECRET_VALUE with your actual CRON_SECRET edge function secret.
-- Requires pg_net extension (enabled by default on Supabase Pro).
--
-- SELECT cron.schedule(
--   'infra-collector-cron',
--   '*/10 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/infra-collector',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', 'CRON_SECRET_VALUE'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- SELECT cron.schedule(
--   'cleanup-infra-metrics-daily',
--   '0 3 * * *',
--   $$ SELECT public.cleanup_infra_metrics(); $$
-- );
-- =============================================
