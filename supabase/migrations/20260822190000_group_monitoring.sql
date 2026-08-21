-- Monitoramento de Grupos: campanha source_type 'monitoring'
-- Watch de termo em mensagens de grupo (UAZAPI); lead que fala o termo é
-- tagueado + abordado 1:1 (campaign_contacts como qualquer campanha).

-- 1) source_type ganha 'monitoring'
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_source_type_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'csv'::text, 'xml'::text, 'crm'::text, 'tag'::text,
    'appointments'::text, 'sales'::text, 'recurrence'::text, 'monitoring'::text
  ]));

-- 2) Config do monitoramento na própria campanha
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monitor_term text,
  ADD COLUMN IF NOT EXISTS monitor_match_mode text
    CHECK (monitor_match_mode IN ('contains', 'equals'));

CREATE INDEX IF NOT EXISTS idx_campaigns_group_monitoring
  ON public.campaigns (group_id)
  WHERE source_type = 'monitoring';

-- 3) 1 monitoramento ATIVO por grupo (cancelled/expired/error liberam)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_monitoring_per_group
  ON public.campaigns (group_id)
  WHERE source_type = 'monitoring'
    AND status NOT IN ('cancelled', 'expired', 'error');

-- 4) Mensagem-gatilho do match (sem FK: messages são apagadas ao resolver a
--    conversa do grupo; a referência é usada só p/ borda/filtro no inbox)
ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS monitor_message_id uuid;

-- 5) expire_campaigns: monitoramento vive em 'dispatching' (nunca vira
--    'dispatched') — ao expirar precisa virar 'expired', senão o índice único
--    uq_active_monitoring_per_group continuaria travando o grupo
CREATE OR REPLACE FUNCTION public.expire_campaigns()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT id, tag_id, status, source_type
        FROM public.campaigns
        WHERE valid_until < now()
          AND expired_processed = FALSE
    LOOP
        PERFORM public.campaign_close_entries(c.id);

        IF c.tag_id IS NOT NULL THEN
            -- CASCADE remove os contact_tags; campaigns.tag_id vira NULL
            DELETE FROM public.tags WHERE id = c.tag_id;
        END IF;

        UPDATE public.campaigns
           SET expired_processed = TRUE,
               status = CASE
                   WHEN status = 'dispatched' THEN 'expired'
                   WHEN source_type = 'monitoring' AND status = 'dispatching' THEN 'expired'
                   ELSE status
               END
         WHERE id = c.id;
    END LOOP;
END;
$function$;
