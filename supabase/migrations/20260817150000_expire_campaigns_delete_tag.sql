-- USER RULE (2026-08-17): campanha encerrada exclui também a TAG criada por ela
-- (não só os vínculos contact_tags). FKs seguras: contact_tags ON DELETE CASCADE,
-- campaigns.tag_id ON DELETE SET NULL. Reenvio (campaign-manage) ganha o mesmo
-- comportamento no edge fn; takeover NÃO exclui a tag (campanha antiga segue
-- valendo para os contatos não movidos).

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
            -- CASCADE remove os contact_tags; campaigns.tag_id vira NULL
            DELETE FROM public.tags WHERE id = c.tag_id;
        END IF;

        UPDATE public.campaigns
           SET expired_processed = TRUE,
               status = CASE WHEN status = 'dispatched' THEN 'expired' ELSE status END
         WHERE id = c.id;
    END LOOP;
END;
$$;
