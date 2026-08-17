-- =============================================
-- USER RULE (2026-08-17, caso Bruno/"Teste IA"): conversa PENDING com resposta
-- do cliente NUNCA é fechada pelo encerramento de campanha. Só conversas SEM
-- resposta do cliente (após o envio) são resolvidas ao encerrar (expiry/reenvio)
-- ou no takeover. A entry congela igual (frozen_responded registra o desfecho);
-- o ticket fica vivo para a equipe responder.
-- Bug: campaign_close_entries/campaign_takeover_sweep resolviam a conversa
-- pending incondicionalmente — resposta do Bruno (12:51) sumiu do inbox às
-- 13:00 quando a campanha expirou.
-- =============================================

CREATE OR REPLACE FUNCTION public.campaign_close_entries(p_campaign_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    r RECORD;
    v_responded BOOLEAN;
BEGIN
    -- Entradas nunca enviadas: campanha encerrou, não serão mais disparadas
    UPDATE campaign_contacts
       SET status = 'skipped',
           error = 'Campanha encerrada antes do envio'
     WHERE campaign_id = p_campaign_id
       AND status IN ('pending', 'sending');

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
        v_responded := public.campaign_contact_responded(r.contact_id, r.sent_at);

        UPDATE campaign_contacts
           SET frozen_at = now(),
               frozen_reason = 'expired',
               frozen_stage = 'Campanha Encerrada',
               frozen_agent = NULL,
               frozen_scheduled = FALSE,
               frozen_responded = v_responded
         WHERE id = r.id;

        -- Só fecha a conversa pending se o cliente NÃO respondeu
        IF r.conversation_id IS NOT NULL AND NOT v_responded THEN
            UPDATE conversations SET status = 'resolved'
             WHERE id = r.conversation_id AND status = 'pending';
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_close_entries(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.campaign_takeover_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    cnew RECORD;
    cold RECORD;
    r RECORD;
    v_responded BOOLEAN;
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
                v_responded := public.campaign_contact_responded(r.contact_id, r.sent_at);

                UPDATE campaign_contacts
                   SET frozen_at = now(),
                       frozen_reason = 'moved',
                       frozen_stage = 'Movido Para Outra Campanha',
                       frozen_agent = NULL,
                       frozen_scheduled = FALSE,
                       frozen_responded = v_responded
                 WHERE id = r.id;

                -- Só fecha a conversa pending se o cliente NÃO respondeu
                IF r.conversation_id IS NOT NULL AND NOT v_responded THEN
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
