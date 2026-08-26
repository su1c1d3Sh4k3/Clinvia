-- Agendamento precisa saber em qual funil (conexão) mexer: useCrmAppointmentSync,
-- scheduler-notifications.concludeCrmOnCompletion e appointment-confirmation-cron
-- movem cards de CRM e agora precisam do canal.
-- Backfill: instância da campanha -> instância da conversa mais próxima do
-- created_at -> instância primária do tenant.

SET lock_timeout = '5s';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_instance ON public.appointments(instance_id);

UPDATE public.appointments a
SET instance_id = c.instance_id
FROM public.campaigns c
WHERE a.instance_id IS NULL
  AND a.campaign_id = c.id
  AND c.instance_id IS NOT NULL;

UPDATE public.appointments a
SET instance_id = (
  SELECT cv.instance_id
  FROM public.conversations cv
  WHERE cv.contact_id = a.contact_id
    AND cv.user_id = a.user_id
    AND cv.instance_id IS NOT NULL
  ORDER BY abs(extract(epoch FROM (cv.created_at - a.created_at)))
  LIMIT 1
)
WHERE a.instance_id IS NULL
  AND a.contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.conversations cv
    WHERE cv.contact_id = a.contact_id
      AND cv.user_id = a.user_id
      AND cv.instance_id IS NOT NULL
  );

-- Fallback final: instância primária de automação do tenant (espelho SQL de
-- pickAutomationInstance: is_automation_primary -> Meta -> mais antiga, conectada).
UPDATE public.appointments a
SET instance_id = (
  SELECT i.id
  FROM public.instances i
  WHERE i.user_id = a.user_id
    AND i.status = 'connected'
  ORDER BY i.is_automation_primary DESC NULLS LAST,
           (i.provider = 'meta' OR i.instance_name LIKE 'meta-%') DESC,
           i.created_at ASC
  LIMIT 1
)
WHERE a.instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.instances i
    WHERE i.user_id = a.user_id AND i.status = 'connected'
  );

NOTIFY pgrst, 'reload schema';

SELECT count(*) FILTER (WHERE instance_id IS NOT NULL) AS com_instancia,
       count(*) FILTER (WHERE instance_id IS NULL) AS sem_instancia,
       count(*) FILTER (WHERE instance_id IS NULL AND contact_id IS NOT NULL) AS sem_instancia_com_contato
FROM public.appointments;
