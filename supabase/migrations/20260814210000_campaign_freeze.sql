-- =============================================================================
-- Campanhas — Congelamento de relatório por contato (plano 2026-08-14)
-- docs/reports/2026-08-14_plano_campanhas_congelamento.md
-- -----------------------------------------------------------------------------
-- Regras:
--  * Janela ativa da campanha = scheduled_at - 1h -> valid_until
--  * 1 campanha ativa por contato POR INSTÂNCIA: nova campanha derruba a antiga
--    em T-1h (sweep 'moved'); pendentes nunca enviados são deletados
--  * Congelamentos (primeiro vence, imutável): scheduled | resolved | moved | expired
--  * Conversa OPEN é intocável: nunca resolvida à força; entrada segue viva
--  * frozen_responded congela Sim/Sem Resposta; frozen_scheduled congela Agendado
--  * Novo status 'open_ticket' (Atendimento Em Aberto) — contato com atendimento
--    aberto na hora do disparo não recebe envio
-- =============================================================================

-- ── 1) Colunas novas ─────────────────────────────────────────────────────────
ALTER TABLE public.campaign_contacts
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS frozen_reason TEXT CHECK (frozen_reason IN ('scheduled','resolved','moved','expired')),
    ADD COLUMN IF NOT EXISTS frozen_stage TEXT,
    ADD COLUMN IF NOT EXISTS frozen_agent TEXT,
    ADD COLUMN IF NOT EXISTS frozen_responded BOOLEAN,
    ADD COLUMN IF NOT EXISTS frozen_scheduled BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_cc_conversation
    ON public.campaign_contacts (conversation_id) WHERE conversation_id IS NOT NULL;

-- Novo status 'open_ticket'
ALTER TABLE public.campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_status_check;
ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_status_check
    CHECK (status IN ('pending','sending','sent','failed','invalid','skipped','open_ticket'));

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_via TEXT CHECK (created_via IN ('manual','ia','public_link','import','gcal'));

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS takeover_processed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2) Helper: contato respondeu após o envio? (messages vivas OU arquivadas) ─
CREATE OR REPLACE FUNCTION public.campaign_contact_responded(p_contact_id UUID, p_sent_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT p_contact_id IS NOT NULL AND p_sent_at IS NOT NULL AND EXISTS (
    SELECT 1
    FROM conversations cv
    WHERE cv.contact_id = p_contact_id
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
$$;

-- ── 3) Congela 'scheduled' quando agendamento VINCULADO à campanha é criado ──
-- Agente: created_by (team_member) -> nome; senão 'IA' (link público/API IA)
CREATE OR REPLACE FUNCTION public.campaign_freeze_on_appointment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_agent TEXT;
BEGIN
    IF NEW.campaign_id IS NULL OR NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tm.name INTO v_agent FROM team_members tm WHERE tm.id = NEW.created_by;

    UPDATE campaign_contacts cc
       SET frozen_at = now(),
           frozen_reason = 'scheduled',
           frozen_stage = 'Agendado',
           frozen_agent = COALESCE(v_agent, 'IA'),
           frozen_scheduled = TRUE,
           frozen_responded = public.campaign_contact_responded(cc.contact_id, cc.sent_at)
     WHERE cc.campaign_id = NEW.campaign_id
       AND cc.contact_id = NEW.contact_id
       AND cc.status = 'sent'
       AND cc.frozen_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_freeze_on_appointment ON public.appointments;
CREATE TRIGGER trg_campaign_freeze_on_appointment
    AFTER INSERT ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.campaign_freeze_on_appointment();

-- ── 4) Congela 'resolved' quando a conversa que recebeu o template resolve ───
-- Nome zz_ garante ordem alfabética após archive/on_conversation_resolve;
-- o helper de resposta cobre messages_history (arquivado no BEFORE trigger).
CREATE OR REPLACE FUNCTION public.campaign_freeze_on_conv_resolve()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_agent TEXT;
BEGIN
    IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
        SELECT CASE WHEN q.name = 'Atendimento IA' THEN 'IA' ELSE tm.name END
          INTO v_agent
          FROM (SELECT 1) x
          LEFT JOIN queues q ON q.id = NEW.queue_id
          LEFT JOIN team_members tm ON tm.id = NEW.assigned_agent_id;

        UPDATE campaign_contacts cc
           SET frozen_at = now(),
               frozen_reason = 'resolved',
               frozen_stage = 'Finalizado',
               frozen_agent = v_agent,
               frozen_scheduled = FALSE,
               frozen_responded = public.campaign_contact_responded(cc.contact_id, cc.sent_at)
         WHERE cc.conversation_id = NEW.id
           AND cc.status = 'sent'
           AND cc.frozen_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_campaign_freeze_on_resolve ON public.conversations;
CREATE TRIGGER zz_campaign_freeze_on_resolve
    AFTER UPDATE OF status ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.campaign_freeze_on_conv_resolve();

-- ── 5) Encerramento de entradas de UMA campanha ('expired') ──────────────────
-- Congela sent não-congeladas SEM conversa aberta do contato + resolve a conversa
-- pendente da campanha (freeze antes do resolve -> trigger de resolve pula).
-- Entradas com conversa OPEN ficam vivas até o desfecho da conversa (regra F2=b).
CREATE OR REPLACE FUNCTION public.campaign_close_entries(p_campaign_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT cc.id, cc.contact_id, cc.sent_at, cc.conversation_id
        FROM campaign_contacts cc
        WHERE cc.campaign_id = p_campaign_id
          AND cc.status = 'sent'
          AND cc.frozen_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM conversations cv
              WHERE cv.contact_id = cc.contact_id AND cv.status = 'open'
          )
    LOOP
        UPDATE campaign_contacts
           SET frozen_at = now(),
               frozen_reason = 'expired',
               frozen_stage = 'Campanha Encerrada',
               frozen_agent = NULL,
               frozen_scheduled = FALSE,
               frozen_responded = public.campaign_contact_responded(contact_id, sent_at)
         WHERE id = r.id;

        IF r.conversation_id IS NOT NULL THEN
            UPDATE conversations SET status = 'resolved'
             WHERE id = r.conversation_id AND status = 'pending';
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_close_entries(UUID) TO service_role;

-- ── 6) expire_campaigns: agora congela entradas antes de remover a tag ───────
CREATE OR REPLACE FUNCTION public.expire_campaigns()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT id, tag_id, status
        FROM public.campaigns
        WHERE valid_until < now()
          AND expired_processed = FALSE
    LOOP
        PERFORM public.campaign_close_entries(c.id);

        IF c.tag_id IS NOT NULL THEN
            DELETE FROM public.contact_tags WHERE tag_id = c.tag_id;
        END IF;

        UPDATE public.campaigns
           SET expired_processed = TRUE,
               status = CASE WHEN status = 'dispatched' THEN 'expired' ELSE status END
         WHERE id = c.id;
    END LOOP;
END;
$$;

-- ── 7) Sweep T-1h: nova campanha derruba a anterior da MESMA instância ───────
-- Para contatos compartilhados: pendentes/open_ticket da antiga -> DELETE;
-- sent não-congeladas sem conversa aberta -> 'moved' + resolve pendente + tag off.
CREATE OR REPLACE FUNCTION public.campaign_takeover_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    cnew RECORD;
    cold RECORD;
    r RECORD;
BEGIN
    FOR cnew IN
        SELECT id, user_id, instance_id, scheduled_at
        FROM campaigns
        WHERE takeover_processed = FALSE
          AND status IN ('scheduled','awaiting_template','dispatching')
          AND scheduled_at - INTERVAL '1 hour' <= now()
    LOOP
        UPDATE campaigns SET takeover_processed = TRUE WHERE id = cnew.id;

        IF cnew.instance_id IS NULL THEN
            CONTINUE;
        END IF;

        FOR cold IN
            SELECT c.id, c.tag_id
            FROM campaigns c
            WHERE c.user_id = cnew.user_id
              AND c.instance_id = cnew.instance_id
              AND c.id <> cnew.id
              AND c.scheduled_at < cnew.scheduled_at
              AND c.status IN ('scheduled','awaiting_template','dispatching','dispatched')
              AND c.valid_until > now()
        LOOP
            -- nunca enviados na campanha antiga: some sem rastro
            DELETE FROM campaign_contacts occ
             USING campaign_contacts ncc
             WHERE occ.campaign_id = cold.id
               AND ncc.campaign_id = cnew.id
               AND occ.contact_id = ncc.contact_id
               AND occ.status IN ('pending','open_ticket');

            FOR r IN
                SELECT occ.id, occ.contact_id, occ.sent_at, occ.conversation_id
                FROM campaign_contacts occ
                JOIN campaign_contacts ncc
                  ON ncc.campaign_id = cnew.id AND ncc.contact_id = occ.contact_id
                WHERE occ.campaign_id = cold.id
                  AND occ.status = 'sent'
                  AND occ.frozen_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM conversations cv
                      WHERE cv.contact_id = occ.contact_id AND cv.status = 'open'
                  )
            LOOP
                UPDATE campaign_contacts
                   SET frozen_at = now(),
                       frozen_reason = 'moved',
                       frozen_stage = 'Movido Para Outra Campanha',
                       frozen_agent = NULL,
                       frozen_scheduled = FALSE,
                       frozen_responded = public.campaign_contact_responded(contact_id, sent_at)
                 WHERE id = r.id;

                IF r.conversation_id IS NOT NULL THEN
                    UPDATE conversations SET status = 'resolved'
                     WHERE id = r.conversation_id AND status = 'pending';
                END IF;

                IF cold.tag_id IS NOT NULL AND r.contact_id IS NOT NULL THEN
                    DELETE FROM contact_tags
                     WHERE tag_id = cold.tag_id AND contact_id = r.contact_id;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_takeover_sweep() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('campaign-takeover'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('campaign-takeover','* * * * *',
    $CRON$SELECT public.campaign_takeover_sweep()$CRON$);

-- ── 8) RPC consolidada por contato (frontend novo; RPCs antigas mantidas) ────
CREATE OR REPLACE FUNCTION public.get_campaign_contact_report(p_campaign_id UUID)
RETURNS TABLE(
    campaign_contact_id UUID,
    responded BOOLEAN,
    scheduled BOOLEAN,
    stage TEXT,
    agent TEXT,
    frozen BOOLEAN,
    frozen_reason TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT
    cc.id AS campaign_contact_id,
    CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
         ELSE cc.status = 'sent' AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
    END AS responded,
    CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_scheduled, FALSE)
         ELSE FALSE
    END AS scheduled,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_stage
         ELSE crm.stage
    END AS stage,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_agent
         WHEN conv.queue_name = 'Atendimento IA' THEN 'IA'
         ELSE conv.agent_name
    END AS agent,
    cc.frozen_at IS NOT NULL AS frozen,
    cc.frozen_reason
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
LEFT JOIN LATERAL (
    SELECT k.stage
    FROM crm_client k
    WHERE k.contact_id = cc.contact_id
      AND k.is_active = TRUE
      AND cc.frozen_at IS NULL
    ORDER BY k.created_at DESC
    LIMIT 1
) crm ON TRUE
LEFT JOIN LATERAL (
    SELECT q.name AS queue_name, tm.name AS agent_name
    FROM conversations cv
    LEFT JOIN queues q ON q.id = cv.queue_id
    LEFT JOIN team_members tm ON tm.id = cv.assigned_agent_id
    WHERE cv.contact_id = cc.contact_id
      AND cv.status IN ('open', 'pending')
      AND cc.frozen_at IS NULL
    ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC
    LIMIT 1
) conv ON TRUE
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;

-- ── 9) Dashboard stats: +scheduled/resolved/no_response, responded congelável ─
DROP FUNCTION IF EXISTS public.get_campaign_dashboard_stats(timestamptz, timestamptz);
CREATE FUNCTION public.get_campaign_dashboard_stats(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(campaign_id UUID, total_contacts INTEGER, valid_contacts INTEGER,
              sent_count INTEGER, delivered_count INTEGER, failed_count INTEGER,
              responded_count INTEGER, converted_count INTEGER,
              scheduled_count INTEGER, resolved_count INTEGER, no_response_count INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH camps AS (
    SELECT c.id, c.scheduled_at, c.valid_until
    FROM campaigns c
    WHERE c.user_id = public.get_owner_id()
      AND (p_from IS NULL OR c.scheduled_at >= p_from)
      AND (p_to   IS NULL OR c.scheduled_at <= p_to)
)
SELECT
    cc.campaign_id,
    COUNT(*)::int                                              AS total_contacts,
    COUNT(*) FILTER (WHERE cc.status <> 'invalid')::int        AS valid_contacts,
    COUNT(*) FILTER (WHERE cc.status = 'sent')::int            AS sent_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'sent' AND (
            cc.message_status IN ('delivered', 'read')
            OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.id = cc.message_id AND m.status IN ('delivered', 'read')
            )
        ))::int                                                AS delivered_count,
    COUNT(*) FILTER (
        WHERE cc.status = 'failed' OR (cc.status = 'sent' AND (
            cc.message_status = 'failed'
            OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.id = cc.message_id AND m.status = 'failed'
            )
        )))::int                                               AS failed_count,
    COUNT(*) FILTER (
        WHERE (cc.frozen_at IS NOT NULL AND cc.frozen_responded)
           OR (cc.frozen_at IS NULL AND cc.status = 'sent'
               AND public.campaign_contact_responded(cc.contact_id, cc.sent_at))
        )::int                                                 AS responded_count,
    COUNT(*) FILTER (
        WHERE cc.contact_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.contact_id = cc.contact_id
              AND a.type = 'appointment'
              AND a.created_at >= cp.scheduled_at
              AND a.created_at <= cp.valid_until
        ))::int                                                AS converted_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_at IS NOT NULL AND cc.frozen_scheduled)::int AS scheduled_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_reason = 'resolved')::int              AS resolved_count,
    COUNT(*) FILTER (
        WHERE cc.frozen_at IS NOT NULL
          AND NOT COALESCE(cc.frozen_responded, FALSE))::int   AS no_response_count
FROM campaign_contacts cc
JOIN camps cp ON cp.id = cc.campaign_id
GROUP BY cc.campaign_id;
$function$;

-- ── 10) Backfill retroativo ──────────────────────────────────────────────────
-- a) conversation_id a partir das messages ainda vivas
UPDATE public.campaign_contacts cc
   SET conversation_id = m.conversation_id
  FROM public.messages m
 WHERE m.id = cc.message_id
   AND cc.conversation_id IS NULL;

-- b) campanhas já iniciadas não sofrem takeover retroativo
UPDATE public.campaigns
   SET takeover_processed = TRUE
 WHERE scheduled_at - INTERVAL '1 hour' <= now();

-- c) 'scheduled' retroativo (semântica antiga: appointment após envio),
--    agente 'Usuário Indisponível' (dado histórico sem autor)
UPDATE public.campaign_contacts cc
   SET frozen_at = now(),
       frozen_reason = 'scheduled',
       frozen_stage = 'Agendado',
       frozen_agent = 'Usuário Indisponível',
       frozen_scheduled = TRUE,
       frozen_responded = public.campaign_contact_responded(cc.contact_id, cc.sent_at)
 WHERE cc.status = 'sent'
   AND cc.frozen_at IS NULL
   AND cc.contact_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM public.appointments a
       WHERE a.contact_id = cc.contact_id
         AND a.type = 'appointment'
         AND a.created_at > cc.sent_at
   );

-- d) 'resolved' retroativo onde a conversa da campanha é conhecida e resolvida
UPDATE public.campaign_contacts cc
   SET frozen_at = now(),
       frozen_reason = 'resolved',
       frozen_stage = 'Finalizado',
       frozen_agent = 'Usuário Indisponível',
       frozen_scheduled = FALSE,
       frozen_responded = public.campaign_contact_responded(cc.contact_id, cc.sent_at)
  FROM public.conversations cv
 WHERE cv.id = cc.conversation_id
   AND cv.status = 'resolved'
   AND cc.status = 'sent'
   AND cc.frozen_at IS NULL;

-- e) sweep 'expired' das campanhas já vencidas
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN SELECT id FROM public.campaigns WHERE valid_until < now() LOOP
        PERFORM public.campaign_close_entries(c.id);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
