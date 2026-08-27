-- Corrige o efeito colateral de 20260827190000: o trigger que gravava
-- frozen_scheduled = TRUE (congelamento por agendamento) foi removido, então
-- campaign_close_entries e campaign_takeover_sweep passaram a congelar SEMPRE
-- com frozen_scheduled = FALSE. Isso quebraria o writeback da Recorrência
-- (deriveApproachOutcome em _shared/recurrence-campaign.ts lê essa coluna para
-- marcar approach_N_status = 'scheduled').
--
-- Agora o valor é DERIVADO na hora do congelamento, com a mesma regra do
-- relatório: existe appointment do contato criado dentro da janela da campanha.

CREATE OR REPLACE FUNCTION public.campaign_contact_scheduled(
    p_contact_id uuid,
    p_from timestamptz,
    p_to   timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT p_contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.contact_id = p_contact_id
          AND a.type = 'appointment'
          AND a.created_at >= p_from
          AND a.created_at <= p_to
    );
$function$;

CREATE OR REPLACE FUNCTION public.campaign_close_entries(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    r RECORD;
    v_responded BOOLEAN;
    v_from timestamptz;
    v_to   timestamptz;
BEGIN
    SELECT scheduled_at, valid_until INTO v_from, v_to
      FROM campaigns WHERE id = p_campaign_id;

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
               frozen_scheduled = public.campaign_contact_scheduled(r.contact_id, v_from, v_to),
               frozen_responded = v_responded
         WHERE id = r.id;

        -- Só fecha a conversa pending se o cliente NÃO respondeu
        IF r.conversation_id IS NOT NULL AND NOT v_responded THEN
            UPDATE conversations SET status = 'resolved'
             WHERE id = r.conversation_id AND status = 'pending';
        END IF;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_takeover_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    cnew RECORD;
    cold RECORD;
    r RECORD;
BEGIN
    FOR cnew IN
        SELECT id, user_id, instance_id, scheduled_at, tag_id
        FROM campaigns
        WHERE takeover_processed = FALSE
          AND status IN ('scheduled','awaiting_template','dispatching')
          AND scheduled_at - INTERVAL '1 hour' <= now()
    LOOP
        UPDATE campaigns SET takeover_processed = TRUE WHERE id = cnew.id;

        -- Tag da campanha nova entra AGORA (T-1h), para toda a audiência
        -- (trg_campaign_tag_drop_on_failure tira de quem não receber)
        IF cnew.tag_id IS NOT NULL THEN
            INSERT INTO contact_tags (contact_id, tag_id, user_id)
            SELECT cc.contact_id, cnew.tag_id, cnew.user_id
            FROM campaign_contacts cc
            WHERE cc.campaign_id = cnew.id
              AND cc.contact_id IS NOT NULL
            ON CONFLICT (contact_id, tag_id) DO NOTHING;
        END IF;

        IF cnew.instance_id IS NULL THEN
            CONTINUE;
        END IF;

        FOR cold IN
            SELECT c.id, c.tag_id, c.scheduled_at, c.valid_until
            FROM campaigns c
            WHERE c.user_id = cnew.user_id
              AND c.instance_id = cnew.instance_id
              AND c.id <> cnew.id
              AND c.scheduled_at < cnew.scheduled_at
              AND c.status IN ('scheduled','awaiting_template','dispatching','dispatched')
              AND c.valid_until > now()
        LOOP
            -- Tag antiga sai de TODOS os contatos compartilhados,
            -- independente de congelamento ou conversa aberta
            IF cold.tag_id IS NOT NULL THEN
                DELETE FROM contact_tags ct
                 USING campaign_contacts ncc
                 WHERE ct.tag_id = cold.tag_id
                   AND ncc.campaign_id = cnew.id
                   AND ncc.contact_id = ct.contact_id;
            END IF;

            -- nunca enviados na campanha antiga: some sem rastro
            DELETE FROM campaign_contacts occ
             USING campaign_contacts ncc
             WHERE occ.campaign_id = cold.id
               AND ncc.campaign_id = cnew.id
               AND occ.contact_id = ncc.contact_id
               AND occ.status IN ('pending','open_ticket');

            -- congela 'sent' sem conversa aberta (freeze segue a regra antiga)
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
                       frozen_scheduled = public.campaign_contact_scheduled(
                           contact_id, cold.scheduled_at, cold.valid_until),
                       frozen_responded = public.campaign_contact_responded(contact_id, sent_at)
                 WHERE id = r.id;

                IF r.conversation_id IS NOT NULL THEN
                    UPDATE conversations SET status = 'resolved'
                     WHERE id = r.conversation_id AND status = 'pending';
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$function$;

NOTIFY pgrst, 'reload schema';
