-- Quadro de resultados da campanha -- USER RULE:
--   "So sao contabilizados clientes que responderam a mensagem da campanha.
--    Os Respondidos tem que ser a soma de Pendentes + Abertos + Resolvidos."
--
-- Dois ajustes:
--
-- 1) "Respondeu" passa a ser escopado na conversa DA CAMPANHA
--    (campaign_contacts.conversation_id). A funcao antiga varria TODAS as
--    conversas do contato, em qualquer conexao -- entao quem respondeu em
--    outro atendimento entrava como se tivesse respondido a campanha (caso
--    ORCAMENTOS EM ABERTO: 5 contatos, 4 deles sem UMA mensagem sequer na
--    conversa da campanha). Sem conversation_id (campanhas antigas de CSV)
--    mantem o comportamento anterior.
--
-- 2) Pendente/Aberto/Resolvido/Removido voltam a contar SO quem respondeu --
--    os 4 somam exatamente responded_count. received_count segue exposto
--    (base do "Sem Resposta") e awaiting_reply_count agora e "respondeu,
--    esta pendente e a ultima mensagem foi do cliente".

CREATE OR REPLACE FUNCTION public.campaign_contact_responded(
    p_conversation_id uuid,
    p_contact_id uuid,
    p_sent_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT p_sent_at IS NOT NULL
   AND (p_conversation_id IS NOT NULL OR p_contact_id IS NOT NULL)
   AND EXISTS (
    SELECT 1
    FROM conversations cv
    WHERE (CASE WHEN p_conversation_id IS NOT NULL
                THEN cv.id = p_conversation_id
                ELSE cv.contact_id = p_contact_id END)
      AND (
        EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = cv.id
              AND m.direction = 'inbound'
              AND m.created_at > p_sent_at
        )
        OR (
            jsonb_typeof(cv.messages_history) = 'array'
            AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(cv.messages_history) e
                WHERE e->>'role' = 'user'
                  AND e->>'created_at' IS NOT NULL
                  AND (e->>'created_at')::timestamptz > p_sent_at
            )
        )
      )
);
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_contact_responded(uuid, uuid, timestamptz) TO authenticated;


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
    awaiting_reply_count integer
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
                       AND b.awaiting_reply)::int                     AS awaiting_reply_count
FROM base b
GROUP BY b.campaign_id;
$function$;


-- Tabela de contatos: mesma regra do quadro, por construcao
CREATE OR REPLACE FUNCTION public.get_campaign_contact_report(p_campaign_id uuid)
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
        cc.conversation_id,
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
                  AND public.campaign_contact_responded(
                          cc.conversation_id, cc.contact_id, cc.sent_at)
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
         WHEN q.name = 'Atendimento IA' THEN 'IA'
         ELSE tm.name
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
    SELECT cv.status AS conv_status, cv.queue_id, cv.assigned_agent_id
    FROM conversations cv
    WHERE b.frozen_at IS NULL
      AND b.responded
      AND cv.id = b.conversation_id
) convd ON TRUE
LEFT JOIN LATERAL (
    SELECT cv.status AS conv_status, cv.queue_id, cv.assigned_agent_id
    FROM conversations cv
    WHERE b.frozen_at IS NULL
      AND b.responded
      AND convd.conv_status IS NULL
      AND cv.contact_id = b.contact_id
      AND cv.group_id IS NULL
      AND (b.instance_id IS NULL OR cv.instance_id = b.instance_id)
    ORDER BY CASE cv.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
             cv.last_message_at DESC NULLS LAST
    LIMIT 1
) convf ON TRUE
LEFT JOIN LATERAL (
    SELECT COALESCE(convd.conv_status, convf.conv_status) AS conv_status,
           COALESCE(convd.queue_id, convf.queue_id) AS queue_id,
           COALESCE(convd.assigned_agent_id, convf.assigned_agent_id) AS assigned_agent_id
) conv ON TRUE
LEFT JOIN queues q ON q.id = conv.queue_id
LEFT JOIN team_members tm ON tm.id = conv.assigned_agent_id;
$function$;

NOTIFY pgrst, 'reload schema';
