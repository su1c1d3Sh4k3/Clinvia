-- USER RULES 2026-08-27 (caso LASER JUN 25 — divergência campanha x inbox):
--
-- 1. "enquanto o cliente possui a etiqueta o monitoramento precisa ser em
--    tempo real; a trava é se ele perde a etiqueta, seja pra outra campanha
--    ou por expirar"  →  congela SÓ em 'moved' e 'expired'.
-- 2. "se o cliente tiver a conversa resolvida ele precisa entrar em
--    resolvidos"      →  o card lê o estado ATUAL da conversa.
-- 3. "o campo agendamento é congelado, mas ele pode estar agendado E
--    aberto/pendente/resolvido — são campos diferentes"
--                     →  dois eixos independentes:
--                        · agendamento = grudou (agendou na janela da campanha)
--                        · status da conversa = ao vivo
-- 4. cards alinhados às abas do inbox (1 ticket por cliente por conexão).

-- ── 1. Fim do congelamento por agendamento ──────────────────────────────
-- O agendamento passa a ser derivado: existe appointment do contato criado
-- dentro da janela da campanha. É naturalmente "grudento" (cancelar depois
-- não apaga o appointment) e não interfere no status da conversa.
DROP TRIGGER IF EXISTS trg_campaign_freeze_on_appointment ON public.appointments;
DROP FUNCTION IF EXISTS public.campaign_freeze_on_appointment();

-- ── 2. Fim do congelamento por conversa resolvida ───────────────────────
-- Resolver a conversa não trava mais o resultado: se o cliente responder
-- depois, a campanha volta a refletir a realidade.
DROP TRIGGER IF EXISTS zz_campaign_freeze_on_resolve ON public.conversations;
DROP FUNCTION IF EXISTS public.campaign_freeze_on_conv_resolve();

-- ── 3. Destrava o histórico das campanhas AINDA VIVAS ───────────────────
-- Campanhas encerradas ficam como estão (o cliente já perdeu a etiqueta,
-- o resultado delas é histórico e não deve mais se mexer).
UPDATE public.campaign_contacts cc
   SET frozen_at = NULL, frozen_reason = NULL, frozen_stage = NULL,
       frozen_agent = NULL, frozen_responded = NULL, frozen_scheduled = NULL
  FROM public.campaigns c
 WHERE c.id = cc.campaign_id
   AND cc.frozen_reason IN ('scheduled', 'resolved')
   AND c.valid_until > now();

-- ── 4. Estatísticas dos cards ───────────────────────────────────────────
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
    resolved_count integer,
    no_response_count integer,
    in_progress_count integer,
    open_count integer,
    awaiting_count integer,
    removed_count integer
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
        -- agendamento: eixo próprio, grudento
        (cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        )) AS did_schedule,
        -- respondeu: congelado só quando perdeu a etiqueta
        CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
             ELSE cc.status = 'sent'
                  AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
        END AS responded,
        tk.status AS conv_status,
        tk.awaiting_reply
    FROM campaign_contacts cc
    JOIN camps cp ON cp.id = cc.campaign_id
    LEFT JOIN LATERAL (
        SELECT cv.status, cv.awaiting_reply
        FROM conversations cv
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
    -- status da conversa (exclusivos entre si, só para quem recebeu)
    COUNT(*) FILTER (WHERE b.status = 'sent' AND b.frozen_at IS NULL
                       AND b.conv_status = 'resolved')::int           AS resolved_count,
    COUNT(*) FILTER (WHERE b.status = 'sent' AND NOT b.responded)::int AS no_response_count,
    COUNT(*) FILTER (WHERE b.status = 'sent' AND b.frozen_at IS NULL)::int AS in_progress_count,
    COUNT(*) FILTER (WHERE b.status = 'sent' AND b.frozen_at IS NULL
                       AND b.conv_status = 'open')::int               AS open_count,
    COUNT(*) FILTER (WHERE b.status = 'sent' AND b.frozen_at IS NULL
                       AND b.conv_status = 'pending'
                       AND b.awaiting_reply IS TRUE)::int             AS awaiting_count,
    COUNT(*) FILTER (WHERE b.frozen_at IS NOT NULL)::int              AS removed_count
FROM base b
GROUP BY b.campaign_id;
$function$;

-- ── 5. Relatório contato a contato ──────────────────────────────────────
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
SELECT
    cc.id AS campaign_contact_id,
    CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
         ELSE cc.status = 'sent' AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
    END AS responded,
    -- agendamento é eixo próprio: grudou na janela, vale mesmo com a
    -- conversa aberta/pendente/resolvida depois
    (cc.contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.contact_id = cc.contact_id
          AND a.type = 'appointment'
          AND a.created_at >= c.scheduled_at
          AND a.created_at <= c.valid_until
    )) AS scheduled,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_stage
         ELSE crm.stage
    END AS stage,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_agent
         WHEN conv.queue_name = 'Atendimento IA' THEN 'IA'
         ELSE conv.agent_name
    END AS agent,
    cc.frozen_at IS NOT NULL AS frozen,
    cc.frozen_reason,
    CASE WHEN cc.frozen_at IS NOT NULL THEN 'removed'
         WHEN conv.conv_status = 'pending' AND conv.awaiting_reply IS TRUE THEN 'awaiting'
         ELSE conv.conv_status
    END AS conv_status
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
LEFT JOIN LATERAL (
    SELECT k.stage
    FROM crm_client k
    WHERE k.contact_id = cc.contact_id
      AND k.is_active = TRUE
      AND cc.frozen_at IS NULL
      AND (c.instance_id IS NULL
           OR k.instance_id IS NULL
           OR k.instance_id = c.instance_id)
    ORDER BY (k.instance_id IS NOT DISTINCT FROM c.instance_id) DESC, k.created_at DESC
    LIMIT 1
) crm ON TRUE
LEFT JOIN LATERAL (
    SELECT cv.status AS conv_status, cv.awaiting_reply,
           q.name AS queue_name, tm.name AS agent_name
    FROM conversations cv
    LEFT JOIN queues q ON q.id = cv.queue_id
    LEFT JOIN team_members tm ON tm.id = cv.assigned_agent_id
    WHERE cv.contact_id = cc.contact_id
      AND cc.frozen_at IS NULL
      AND cv.group_id IS NULL
      AND (c.instance_id IS NULL OR cv.instance_id = c.instance_id)
    ORDER BY CASE cv.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
             cv.last_message_at DESC NULLS LAST
    LIMIT 1
) conv ON TRUE
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;

NOTIFY pgrst, 'reload schema';
