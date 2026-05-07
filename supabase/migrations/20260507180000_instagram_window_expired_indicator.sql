-- ====================================================================
-- Indicador "fora da janela 24h" (Instagram only)
--
-- Adiciona um boolean em conversations que sinaliza quando a janela de
-- 24h da Instagram Messaging API expirou (cliente sem responder >24h).
-- O front usa esse flag pra renderizar bolinha VERMELHA no card.
-- ====================================================================

-- 1) Coluna nova
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS instagram_window_expired BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.conversations.instagram_window_expired IS
    'TRUE quando a janela de 24h da Instagram Messaging API expirou (cliente sem responder >24h). Reseta quando cliente envia nova mensagem inbound.';

-- Index parcial: só rastreia o caso de uso (Instagram + expirada)
CREATE INDEX IF NOT EXISTS idx_conversations_ig_window_expired
    ON public.conversations (channel, instagram_window_expired)
    WHERE channel = 'instagram' AND instagram_window_expired = TRUE;

-- 2) Função do cron: marca tudo que está fora da janela
CREATE OR REPLACE FUNCTION public.mark_expired_instagram_windows()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE public.conversations
        SET instagram_window_expired = TRUE
    WHERE channel = 'instagram'
      AND status IN ('open', 'pending')
      AND instagram_window_expired = FALSE
      AND last_customer_message_at IS NOT NULL
      AND last_customer_message_at < (now() - INTERVAL '24 hours');
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.mark_expired_instagram_windows() IS
    'Marca conversas Instagram open/pending cujo cliente não responde há mais de 24h. Roda via pg_cron a cada 30min.';

-- 3) Cron a cada 30 min
SELECT cron.schedule(
    'instagram-window-expired-check',
    '*/30 * * * *',
    $cron$SELECT public.mark_expired_instagram_windows()$cron$
);

-- 4) Modifica trigger existente pra REABRIR janela quando cliente volta a mandar
--    msg. Mantém TODA a lógica original, só adiciona o reset condicional no fim
--    do bloco de inbound.
CREATE OR REPLACE FUNCTION public.update_conversation_metrics_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_conv public.conversations%ROWTYPE;
    v_ref_timestamp TIMESTAMPTZ;
    v_duration_seconds INTEGER;
BEGIN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF NEW.direction = 'inbound' THEN
        UPDATE public.conversations
        SET last_customer_message_at = NEW.created_at
        WHERE id = NEW.conversation_id;

        -- Cliente Instagram voltou a mandar msg → reabre janela de 24h
        IF v_conv.channel = 'instagram' AND v_conv.instagram_window_expired = TRUE THEN
            UPDATE public.conversations
            SET instagram_window_expired = FALSE
            WHERE id = NEW.conversation_id;
        END IF;
    END IF;

    IF NEW.direction = 'outbound' AND v_conv.first_response_at IS NULL THEN
        v_ref_timestamp := COALESCE(v_conv.last_customer_message_at, v_conv.created_at);
        v_duration_seconds := EXTRACT(EPOCH FROM (NEW.created_at - v_ref_timestamp))::INTEGER;
        IF v_duration_seconds < 0 THEN v_duration_seconds := 0; END IF;

        UPDATE public.conversations
        SET first_response_at = NEW.created_at,
            first_response_by_ai = COALESCE(NEW.is_ai_response, false),
            first_response_duration_seconds = v_duration_seconds
        WHERE id = NEW.conversation_id;
    END IF;

    IF COALESCE(NEW.is_ai_response, false) = true AND COALESCE(v_conv.is_ai_handled, false) = false THEN
        UPDATE public.conversations
        SET is_ai_handled = true
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 5) Backfill: marca imediatamente conversas que já estão fora da janela
SELECT public.mark_expired_instagram_windows() AS conversations_marked_on_backfill;
