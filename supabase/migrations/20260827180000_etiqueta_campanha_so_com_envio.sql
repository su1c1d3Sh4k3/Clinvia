-- USER RULE 2026-08-27: "Se o cliente não recebeu a mensagem da campanha
-- ele não deve ter etiqueta."
--
-- A etiqueta continua sendo atribuída a toda a audiência no T-1h
-- (campaign_takeover_sweep) — o que muda é que ela é REMOVIDA assim que o
-- sistema identifica que aquele contato não recebeu a mensagem:
--   * status 'open_ticket'  → conversa aberta no disparo, pulado
--   * status 'failed'       → erro no envio
--   * status 'invalid'      → número inválido
--   * status 'skipped'      → descartado pelo worker
--   * message_status 'failed' → a Meta aceitou o wamid e rejeitou depois
--     (spam rate limit etc.), ou seja, a entrada fica 'sent' mas o cliente
--     nunca recebeu.

CREATE OR REPLACE FUNCTION public.campaign_tag_drop_on_failure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tag UUID;
BEGIN
    IF NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT (
        NEW.status IN ('open_ticket', 'failed', 'invalid', 'skipped')
        OR NEW.message_status = 'failed'
    ) THEN
        RETURN NEW;
    END IF;

    SELECT tag_id INTO v_tag FROM campaigns WHERE id = NEW.campaign_id;
    IF v_tag IS NULL THEN
        RETURN NEW;
    END IF;

    -- tag_id é exclusivo da campanha e há no máximo 1 entrada por contato
    -- por campanha, então não há risco de apagar a etiqueta de outra origem
    DELETE FROM contact_tags
     WHERE tag_id = v_tag AND contact_id = NEW.contact_id;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_campaign_tag_drop_on_failure ON public.campaign_contacts;
CREATE TRIGGER trg_campaign_tag_drop_on_failure
AFTER INSERT OR UPDATE OF status, message_status ON public.campaign_contacts
FOR EACH ROW EXECUTE FUNCTION public.campaign_tag_drop_on_failure();
