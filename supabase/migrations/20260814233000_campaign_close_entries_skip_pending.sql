-- Auditoria e2e P3: campanha encerrada (expiry/reenvio) não deixa entradas
-- 'pending'/'sending' presas — viram 'skipped' (nunca serão pegas pelo pick,
-- só inflavam total_contacts). Comportamento de sent/frozen inalterado.

CREATE OR REPLACE FUNCTION public.campaign_close_entries(p_campaign_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    r RECORD;
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
