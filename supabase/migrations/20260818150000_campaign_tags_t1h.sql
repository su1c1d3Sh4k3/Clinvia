-- USER RULES 2026-08-18 (caso Tatiane com 5 tags):
-- 1) A tag da campanha é atribuída aos contatos 1h ANTES do disparo — não na
--    criação (campaign-manage parou de taggear na criação).
-- 2) A tag NÃO tem relação com o congelamento: takeover remove a tag antiga de
--    TODOS os contatos compartilhados, mesmo com conversa aberta (o freeze do
--    relatório continua respeitando conversa open). Expiração já exclui a tag
--    inteira via expire_campaigns (sem mudança).

-- ── 1) Sweep T-1h: taggeia a audiência da campanha nova + derruba a anterior ─
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
        SELECT id, user_id, instance_id, scheduled_at, tag_id
        FROM campaigns
        WHERE takeover_processed = FALSE
          AND status IN ('scheduled','awaiting_template','dispatching')
          AND scheduled_at - INTERVAL '1 hour' <= now()
    LOOP
        UPDATE campaigns SET takeover_processed = TRUE WHERE id = cnew.id;

        -- Tag da campanha nova entra AGORA (T-1h), para toda a audiência
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
            SELECT c.id, c.tag_id
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
                       frozen_scheduled = FALSE,
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
$$;

GRANT EXECUTE ON FUNCTION public.campaign_takeover_sweep() TO service_role;

-- ── 2) Data-fix a: tags de campanhas encerradas (legado pré-20260817150000 +
--       reinserções indevidas do backfill 20260818120000). CASCADE limpa os
--       contact_tags; campaigns.tag_id vira NULL.
DELETE FROM public.tags t
USING public.campaigns c
WHERE c.tag_id = t.id
  AND (c.status IN ('expired','error') OR c.expired_processed);

-- ── 3) Data-fix b: vínculos recolocados pelo backfill em entradas tomadas por
--       takeover (frozen_reason='moved') — a tag já tinha sido removida
DELETE FROM public.contact_tags ct
USING public.campaign_contacts cc, public.campaigns c
WHERE cc.campaign_id = c.id
  AND c.tag_id = ct.tag_id
  AND cc.contact_id = ct.contact_id
  AND cc.frozen_reason = 'moved';

-- ── 4) Data-fix c: tags aplicadas na criação de campanhas que ainda não
--       chegaram ao T-1h (o sweep as recoloca na hora certa)
DELETE FROM public.contact_tags ct
USING public.campaigns c
WHERE c.tag_id = ct.tag_id
  AND c.takeover_processed = FALSE
  AND c.status IN ('scheduled','awaiting_template');
