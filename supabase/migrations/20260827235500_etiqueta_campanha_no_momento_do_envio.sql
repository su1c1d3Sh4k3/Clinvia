-- USER RULE 2026-08-27 (caso Rayssa Moraes): "nao vai dar certo isso de
-- etiquetar tudo de uma vez, etiquete o cliente a medida que a mensagem for
-- enviada, se for rejeitada remova".
--
-- Ate agora o sweep T-1h (20260818150000) etiquetava a AUDIENCIA INTEIRA e a
-- etiqueta so saia depois, quando o sistema descobria a falha
-- (trg_campaign_tag_drop_on_failure, 20260827180000). Numa campanha grande a
-- fila leva horas: quem ainda esta 'pending' (nunca disparou) ficava dias com a
-- etiqueta — foi o caso da Rayssa, entry 'pending' e etiqueta desde o T-1h.
--
-- Agora a etiqueta e colocada UMA A UMA, no momento em que o envio da certo
-- (campaign-dispatch.tagContact, ja rodava logo apos status='sent'), e o
-- trigger de falha continua removendo em rejeicao/erro/invalido/pulado. O sweep
-- deixa de etiquetar; ele segue removendo a etiqueta da campanha ANTERIOR dos
-- contatos compartilhados (regra "1 campanha por contato por instancia") e
-- congelando as entradas tomadas.

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

        -- A tag da campanha nova NAO entra aqui: quem coloca e o dispatch,
        -- contato a contato, assim que a mensagem sai (USER RULE 2026-08-27)

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

-- Limpeza: tira a etiqueta de quem foi marcado em lote e ainda nao recebeu
-- (fila 'pending'/'sending' ou sem entrada nenhuma na campanha)
DELETE FROM public.contact_tags ct
USING public.campaigns c
WHERE c.tag_id = ct.tag_id
  AND NOT EXISTS (
      SELECT 1 FROM public.campaign_contacts cc
      WHERE cc.campaign_id = c.id
        AND cc.contact_id = ct.contact_id
        AND cc.status = 'sent'
  );
