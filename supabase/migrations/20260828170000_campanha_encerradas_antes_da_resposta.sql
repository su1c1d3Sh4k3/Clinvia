-- USER RULE (caso ORCAMENTOS EM ABERTO, 6a passagem): o quadro mostra 8
-- resolvidos e o inbox, filtrado por instancia + etiqueta da campanha, lista 21
-- na aba Resolvidos. Os dois estao certos e medem coisas diferentes:
--
--   * o quadro conta CLIENTE QUE RESPONDEU a mensagem da campanha;
--   * o inbox conta TICKET ENCERRADO.
--
-- No caso real a atendente abriu e encerrou 13 tickets em sequencia (um a cada
-- ~8s, ultima mensagem arquivada = a pilula "O colaborador ... visualizou essa
-- conversa"), todos de clientes que nunca escreveram uma linha. 21 - 13 = 8.
--
-- Para a equipe conseguir explicar a diferenca sem abrir o banco, o quadro
-- passa a expor closed_no_reply_count = recebeu, NAO respondeu e a conversa da
-- campanha ja foi encerrada. O card mostra isso como legenda embaixo de
-- "Resolvido". A invariante Pendente+Aberto+Resolvido+Removido = Respondidas
-- NAO muda -- a coluna nova e informativa e nao entra em nenhuma soma.

-- RETURNS TABLE ganhou coluna: CREATE OR REPLACE nao aceita, precisa dropar
DROP FUNCTION IF EXISTS public.get_campaign_dashboard_stats(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_campaign_dashboard_stats(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE(
    campaign_id uuid,
    total_contacts integer,
    valid_contacts integer,
    sent_count integer,
    delivered_count integer,
    failed_count integer,
    responded_count integer,
    converted_count integer,
    scheduled_count integer,
    no_response_count integer,
    open_count integer,
    pending_count integer,
    resolved_count integer,
    removed_count integer,
    in_progress_count integer,
    received_count integer,
    awaiting_reply_count integer,
    closed_no_reply_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH camps AS (
    SELECT c.id, c.scheduled_at, c.valid_until, c.instance_id
    FROM campaigns c
    WHERE c.user_id = public.get_owner_id()
      AND (p_from IS NULL OR c.scheduled_at >= p_from)
      AND (p_to   IS NULL OR c.scheduled_at <= p_to)
),
base AS (
    SELECT
        cc.campaign_id,
        cc.status,
        cc.message_status,
        cc.message_id,
        cc.frozen_at,
        cc.contact_id,
        -- recebeu de fato: enviada e nao rejeitada (rejeicao assincrona da Meta
        -- deixa a entry 'sent' com message_status 'failed' e tira a etiqueta)
        (cc.status = 'sent' AND COALESCE(cc.message_status, '') <> 'failed'
         AND NOT EXISTS (SELECT 1 FROM messages m
                         WHERE m.id = cc.message_id AND m.status = 'failed')) AS received,
        -- agendamento: eixo proprio, grudento
        (cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        )) AS did_schedule,
        -- respondeu A MENSAGEM DA CAMPANHA (na conversa que ela abriu);
        -- congelado so quando perdeu a etiqueta
        CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
             ELSE cc.status = 'sent'
                  AND public.campaign_contact_responded(
                          cc.conversation_id, cc.contact_id, cc.sent_at)
        END AS responded,
        COALESCE(tkd.status, tkf.status)                       AS conv_status,
        COALESCE(tkd.assigned_agent_id, tkf.assigned_agent_id) AS assigned_agent_id,
        COALESCE(tkd.awaiting_reply, tkf.awaiting_reply)       AS awaiting_reply,
        q.name                                                 AS queue_name
    FROM campaign_contacts cc
    JOIN camps cp ON cp.id = cc.campaign_id
    -- a conversa que a campanha criou
    LEFT JOIN LATERAL (
        SELECT cv.status, cv.assigned_agent_id, cv.awaiting_reply, cv.queue_id
        FROM conversations cv
        WHERE cc.frozen_at IS NULL
          AND cc.status = 'sent'
          AND cv.id = cc.conversation_id
    ) tkd ON TRUE
    -- reserva: campanhas antigas sem conversation_id (ou conversa ja apagada)
    LEFT JOIN LATERAL (
        SELECT cv.status, cv.assigned_agent_id, cv.awaiting_reply, cv.queue_id
        FROM conversations cv
        WHERE cc.frozen_at IS NULL
          AND cc.status = 'sent'
          AND tkd.status IS NULL
          AND cv.contact_id = cc.contact_id
          AND cv.group_id IS NULL
          AND (cp.instance_id IS NULL OR cv.instance_id = cp.instance_id)
        ORDER BY CASE cv.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                 cv.last_message_at DESC NULLS LAST
        LIMIT 1
    ) tkf ON TRUE
    LEFT JOIN queues q ON q.id = COALESCE(tkd.queue_id, tkf.queue_id)
)
SELECT
    b.campaign_id,
    COUNT(*)::int                                                     AS total_contacts,
    COUNT(*) FILTER (WHERE b.status <> 'invalid')::int                AS valid_contacts,
    COUNT(*) FILTER (WHERE b.status = 'sent')::int                    AS sent_count,
    COUNT(*) FILTER (
        WHERE b.status = 'sent' AND (
            b.message_status IN ('delivered', 'read')
            OR EXISTS (SELECT 1 FROM messages m
                        WHERE m.id = b.message_id AND m.status IN ('delivered', 'read'))
        ))::int                                                       AS delivered_count,
    COUNT(*) FILTER (
        WHERE b.status = 'failed' OR (b.status = 'sent' AND (
            b.message_status = 'failed'
            OR EXISTS (SELECT 1 FROM messages m
                        WHERE m.id = b.message_id AND m.status = 'failed')
        )))::int                                                      AS failed_count,
    COUNT(*) FILTER (WHERE b.responded)::int                          AS responded_count,
    COUNT(*) FILTER (WHERE b.did_schedule)::int                       AS converted_count,
    COUNT(*) FILTER (WHERE b.did_schedule)::int                       AS scheduled_count,
    COUNT(*) FILTER (WHERE b.received AND NOT b.responded)::int       AS no_response_count,
    -- Estado ATUAL da conversa de QUEM RESPONDEU; os 4 sao exclusivos entre si
    -- e somam exatamente responded_count ('resolvido' e o caso restante, entao
    -- entry sem conversa localizavel nao some da conta)
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NULL
                       AND b.conv_status = 'open')::int               AS open_count,
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NULL
                       AND b.conv_status = 'pending')::int            AS pending_count,
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NULL
                       AND b.conv_status IS DISTINCT FROM 'open'
                       AND b.conv_status IS DISTINCT FROM 'pending')::int AS resolved_count,
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NOT NULL)::int  AS removed_count,
    -- Em atendimento: humano assumiu (aberta + atribuida) ou a IA esta
    -- respondendo (pendente na fila 'Atendimento IA')
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NULL AND (
            (b.conv_status = 'open' AND b.assigned_agent_id IS NOT NULL)
         OR (b.conv_status = 'pending' AND b.queue_name = 'Atendimento IA')
    ))::int                                                           AS in_progress_count,
    COUNT(*) FILTER (WHERE b.received)::int                           AS received_count,
    -- respondeu, esta pendente e a ultima mensagem foi do cliente
    COUNT(*) FILTER (WHERE b.responded AND b.frozen_at IS NULL
                       AND b.conv_status = 'pending'
                       AND b.awaiting_reply)::int                     AS awaiting_reply_count,
    -- FORA das somas: recebeu, nao respondeu e alguem ja encerrou o ticket.
    -- E a diferenca entre o "Resolvido" do quadro e a aba Resolvidos do inbox.
    COUNT(*) FILTER (WHERE b.received AND NOT b.responded
                       AND b.frozen_at IS NULL
                       AND b.conv_status = 'resolved')::int           AS closed_no_reply_count
FROM base b
GROUP BY b.campaign_id;
$function$;

NOTIFY pgrst, 'reload schema';
