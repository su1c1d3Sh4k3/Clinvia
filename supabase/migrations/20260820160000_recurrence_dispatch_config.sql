-- Fase 3 recorrência: instância de disparo + hora base do disparo diário
-- (plano docs/reports/2026-08-20_plano_recorrencia_templates.md, R14/R18)

-- Instância preferida para campanhas de recorrência (espelho de is_automation_primary)
ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS is_recurrence_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_instances_recurrence_primary_per_user
    ON public.instances (user_id)
    WHERE is_recurrence_primary;

-- Hora base BRT do disparo (campanha inicia em horário aleatório entre X:00 e X+1:00)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS recurrence_dispatch_hour smallint NOT NULL DEFAULT 9
        CHECK (recurrence_dispatch_hour BETWEEN 0 AND 23);
