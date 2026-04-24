-- =====================================================
-- Instance Health-Check Infra
-- =====================================================
-- 1. Novos tipos de notificação: instance_disconnected / instance_reconnected
-- 2. Colunas last_health_check e last_disconnect_notified_at em instances
-- =====================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
        'task_created', 'task_open', 'task_finished',
        'deal_stagnated', 'deal_created', 'deal_stage_changed',
        'queue_changed',
        'appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated',
        'sale_cash', 'sale_installment', 'sale_pending',
        'instance_disconnected', 'instance_reconnected'
    ]));

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_disconnect_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_instances_status_last_health
    ON public.instances(status, last_health_check);

COMMENT ON COLUMN public.instances.last_health_check
    IS 'Timestamp do ultimo ping de health-check a UZAPI (atualizado pelo cron uzapi-health-check)';
COMMENT ON COLUMN public.instances.last_disconnect_notified_at
    IS 'Timestamp da ultima notificacao de desconexao — evita spam (silencia por 24h)';
