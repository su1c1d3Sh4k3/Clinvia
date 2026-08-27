-- USER RULE 2026-08-27 (caso "ORÇAMENTOS EM ABERTO 1000": filtro Resolvido na
-- tabela devolvia 59 e o quadro mostrava 20 Respondidas / 6 Resolvidos).
--
-- Causa: o quadro (get_campaign_dashboard_stats) detalha o estagio SO de quem
-- respondeu e so olha entries ja disparadas (cc.status = 'sent'), enquanto a
-- tabela (get_campaign_contact_report) devolvia o estagio da conversa para
-- QUALQUER entry — inclusive quem nem recebeu a mensagem ainda. Composicao real
-- dos 59: 6 respondidas com a conversa encerrada + 49 entries ainda na fila
-- ('pending') + 1 'sending' + 2 'open_ticket', todas herdando o status de uma
-- conversa ANTIGA do contato naquele numero.
--
-- Correcao: as duas fontes passam a usar a mesma base.
--   · entry congelada          -> 'removed' (como ja era)
--   · entry que respondeu      -> estagio da conversa (sem conversa = 'resolved',
--                                 mesmo "resto" que o quadro usa)
--   · qualquer outra           -> NULL, e a tabela mostra "—"
-- As colunas Estagio e Atendente passam a existir so para quem respondeu ao
-- disparo — quem nao respondeu esta em "Sem Resposta", nao em atendimento.

DROP FUNCTION IF EXISTS public.get_campaign_contact_report(uuid);

CREATE FUNCTION public.get_campaign_contact_report(p_campaign_id uuid)
RETURNS TABLE(
    campaign_contact_id uuid,
    responded boolean,
    scheduled boolean,
    stage text,
    agent text,
    frozen boolean,
    frozen_reason text,
    conv_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH base AS (
    SELECT
        cc.id,
        cc.contact_id,
        cc.status,
        cc.sent_at,
        cc.frozen_at,
        cc.frozen_responded,
        cc.frozen_stage,
        cc.frozen_agent,
        cc.frozen_reason,
        c.instance_id,
        c.scheduled_at,
        c.valid_until,
        CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
             ELSE cc.status = 'sent'
                  AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
        END AS responded
    FROM campaign_contacts cc
    JOIN campaigns c ON c.id = cc.campaign_id
    WHERE cc.campaign_id = p_campaign_id
      AND c.user_id = public.get_owner_id()
)
SELECT
    b.id AS campaign_contact_id,
    b.responded,
    -- agendamento e eixo proprio: grudou na janela, vale mesmo com a
    -- conversa aberta/pendente/resolvida depois
    (b.contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.contact_id = b.contact_id
          AND a.type = 'appointment'
          AND a.created_at >= b.scheduled_at
          AND a.created_at <= b.valid_until
    )) AS scheduled,
    CASE WHEN b.frozen_at IS NOT NULL THEN b.frozen_stage
         ELSE crm.stage
    END AS stage,
    CASE WHEN b.frozen_at IS NOT NULL THEN b.frozen_agent
         WHEN NOT b.responded THEN NULL
         WHEN conv.queue_name = 'Atendimento IA' THEN 'IA'
         ELSE conv.agent_name
    END AS agent,
    b.frozen_at IS NOT NULL AS frozen,
    b.frozen_reason,
    -- Mesma base do quadro: so quem respondeu tem estagio; sem conversa
    -- localizavel o quadro conta como 'resolvido', entao a tabela idem
    CASE WHEN b.frozen_at IS NOT NULL THEN 'removed'
         WHEN NOT b.responded THEN NULL
         ELSE COALESCE(conv.conv_status, 'resolved')
    END AS conv_status
FROM base b
LEFT JOIN LATERAL (
    SELECT k.stage
    FROM crm_client k
    WHERE k.contact_id = b.contact_id
      AND k.is_active = TRUE
      AND b.frozen_at IS NULL
      AND (b.instance_id IS NULL
           OR k.instance_id IS NULL
           OR k.instance_id = b.instance_id)
    ORDER BY (k.instance_id IS NOT DISTINCT FROM b.instance_id) DESC, k.created_at DESC
    LIMIT 1
) crm ON TRUE
LEFT JOIN LATERAL (
    SELECT cv.status AS conv_status, q.name AS queue_name, tm.name AS agent_name
    FROM conversations cv
    LEFT JOIN queues q ON q.id = cv.queue_id
    LEFT JOIN team_members tm ON tm.id = cv.assigned_agent_id
    WHERE b.frozen_at IS NULL
      AND b.status = 'sent'
      AND b.responded
      AND cv.contact_id = b.contact_id
      AND cv.group_id IS NULL
      AND (b.instance_id IS NULL OR cv.instance_id = b.instance_id)
    ORDER BY CASE cv.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
             cv.last_message_at DESC NULLS LAST
    LIMIT 1
) conv ON TRUE;
$function$;

NOTIFY pgrst, 'reload schema';
