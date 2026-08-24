-- Monitoramento de Grupos: leads capturados devem receber a abordagem IMEDIATAMENTE.
-- Bug (caso Bruno / AGOSTO POWER, 2026-08-24): pick_campaign_contacts ordenava por
-- created_at ASC global — uma campanha comum com fila grande (BOTOX VENCIDO, 321
-- pendentes) na mesma janela deixava o lead do monitoramento por horas na fila.
-- Fix: entries de campanhas source_type='monitoring' têm prioridade no pick.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.pick_campaign_contacts(p_limit integer DEFAULT 4)
 RETURNS SETOF campaign_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Recovery: linhas presas em 'sending' há mais de 5 minutos voltam a 'pending'
    UPDATE public.campaign_contacts
       SET status = 'pending', picked_at = NULL
     WHERE status = 'sending'
       AND picked_at < now() - INTERVAL '5 minutes';

    RETURN QUERY
    WITH candidate AS (
        SELECT cc.id
        FROM public.campaign_contacts cc
        JOIN public.campaigns c ON c.id = cc.campaign_id
        WHERE cc.status = 'pending'
          AND c.status = 'dispatching'
        -- Monitoramento primeiro (abordagem imediata ao lead), depois FIFO
        ORDER BY (c.source_type = 'monitoring') DESC, cc.created_at ASC
        FOR UPDATE OF cc SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.campaign_contacts j
       SET status = 'sending',
           picked_at = now()
      FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.*;
END;
$function$;
