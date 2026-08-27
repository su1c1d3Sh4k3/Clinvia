-- USER RULE 2026-08-27 (caso "ULTIMA SEMANA DE AGOSTO 400 NOMES"):
-- "pra estar em atendimento precisa estar aberto e atribuido a alguem" e
-- "pra estar em atendimento pela IA precisa estar na fila Atendimento IA,
--  templates de confirmacao nao entram nisso".
--
-- A regra anterior (20260827210000) definia Em Atendimento como "o cliente
-- respondeu, o ticket esta vivo e a ultima mensagem e NOSSA"
-- (awaiting_reply = FALSE), assumindo que numa conversa PENDENTE so a IA
-- responderia. Na conta da campanha acima a IA esta desligada, mas as
-- automacoes de agendamento (sys_confirm_24h / sys_reminder_2h /
-- sys_feedback_24h e as respostas do appointment-confirmation-respond)
-- continuam escrevendo por cima da conversa pendente -> awaiting_reply virava
-- FALSE e 16 conversas sem atendente nenhum entravam no contador
-- (19 exibidos x 3 reais).
--
-- Nova definicao (nao depende mais de quem falou por ultimo):
--   · conversa ABERTA com assigned_agent_id preenchido  -> humano assumiu
--   · conversa PENDENTE na fila 'Atendimento IA'        -> a IA esta atendendo
-- Qualquer outra combinacao (aberta sem atendente, pendente na fila humana,
-- pendente recebendo so template automatico) NAO conta.

DROP FUNCTION IF EXISTS public.get_campaign_dashboard_stats(timestamptz, timestamptz);

CREATE FUNCTION public.get_campaign_dashboard_stats(
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
    in_progress_count integer
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
        -- agendamento: eixo proprio, grudento
        (cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        )) AS did_schedule,
        -- respondeu: congelado so quando perdeu a etiqueta
        CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
             ELSE cc.status = 'sent'
                  AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
        END AS responded,
        tk.status AS conv_status,
        tk.assigned_agent_id,
        tk.queue_name
    FROM campaign_contacts cc
    JOIN camps cp ON cp.id = cc.campaign_id
    LEFT JOIN LATERAL (
        SELECT cv.status, cv.assigned_agent_id, q.name AS queue_name
        FROM conversations cv
        LEFT JOIN queues q ON q.id = cv.queue_id
        WHERE cc.frozen_at IS NULL
          AND cc.status = 'sent'
          AND cv.contact_id = cc.contact_id
          AND cv.group_id IS NULL
          AND (cp.instance_id IS NULL OR cv.instance_id = cp.instance_id)
        ORDER BY CASE cv.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                 cv.last_message_at DESC NULLS LAST
        LIMIT 1
    ) tk ON TRUE
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
    COUNT(*) FILTER (WHERE b.status = 'sent' AND NOT b.responded)::int AS no_response_count,
    -- Estado da conversa SO de quem respondeu; os 4 sao exclusivos entre si e
    -- somam exatamente responded_count ('resolvido' e o caso restante, entao
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
    ))::int                                                           AS in_progress_count
FROM base b
GROUP BY b.campaign_id;
$function$;

NOTIFY pgrst, 'reload schema';
