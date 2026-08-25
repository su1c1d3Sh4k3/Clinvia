-- Prioridade de envio: Mensagens automáticas (confirmação/lembrete/pesquisa) > Monitoramento > Campanhas
-- 1) instances.automation_hold_until: setado pelo appointment-confirmation-cron enquanto processa
--    os fluxos de um usuário (janela de envio ativa, ambos providers). Expira sozinho (crash safety).
-- 2) pick_campaign_contacts ganha 2 guards:
--    a) instância da campanha com hold ativo → pula (envio automático em andamento AGORA)
--    b) instância da campanha = instância de automação do dono E existe fila automation_send_queue
--       vencida (Meta, backlog entre ticks do cron de 10min) → pula até a fila esvaziar
--    Monitoramento também respeita os guards (automáticas > monitoramento); a retomada é
--    automática no próximo ciclo do worker (1min).

SET lock_timeout = '5s';

ALTER TABLE public.instances
  ADD COLUMN IF NOT EXISTS automation_hold_until timestamptz NULL;

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
          -- Guard 1: instância com envio automático em andamento (hold ativo)
          AND NOT EXISTS (
              SELECT 1 FROM public.instances ih
              WHERE ih.id = c.instance_id
                AND ih.automation_hold_until IS NOT NULL
                AND ih.automation_hold_until > now()
          )
          -- Guard 2: instância da campanha é a instância de automação do dono
          -- e há mensagens automáticas Meta vencidas aguardando na fila
          AND NOT (
              c.instance_id = (
                  SELECT i.id FROM public.instances i
                  WHERE i.user_id = c.user_id
                    AND i.status = 'connected'
                  ORDER BY i.is_automation_primary DESC NULLS LAST,
                           (i.provider = 'meta' OR i.instance_name LIKE 'meta-%') DESC,
                           i.created_at ASC
                  LIMIT 1
              )
              AND EXISTS (
                  SELECT 1 FROM public.automation_send_queue q
                  WHERE q.user_id = c.user_id
                    AND q.status = 'scheduled'
                    AND q.scheduled_for <= now()
                    AND COALESCE(q.next_attempt_at, q.scheduled_for) <= now()
              )
          )
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
