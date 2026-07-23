-- Instância principal para envios automáticos (confirmação de agendamento etc.)
-- Prioridade padrão: Meta (API oficial). O cliente pode sobrescrever marcando
-- manualmente uma instância como principal na aba Automações em Configurações.

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS is_automation_primary boolean NOT NULL DEFAULT false;

-- Apenas 1 instância principal por usuário
CREATE UNIQUE INDEX IF NOT EXISTS instances_automation_primary_unique
    ON public.instances (user_id)
    WHERE is_automation_primary;
