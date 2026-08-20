-- Fase 2 recorrência: vínculo de templates Meta com serviço + nº da mensagem
-- (plano docs/reports/2026-08-20_plano_recorrencia_templates.md, R1/R2/R6)

ALTER TABLE public.message_templates
    ADD COLUMN IF NOT EXISTS service_client_id uuid NULL REFERENCES public.services_client(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurrence_msg_number smallint NULL CHECK (recurrence_msg_number BETWEEN 1 AND 3);

-- 1 template ativo por serviço+mensagem+instância
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurrence_template
    ON public.message_templates (service_client_id, recurrence_msg_number, instance_id)
    WHERE service_client_id IS NOT NULL;
