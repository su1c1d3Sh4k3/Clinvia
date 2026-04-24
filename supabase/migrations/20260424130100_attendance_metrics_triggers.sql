-- =====================================================
-- Attendance Metrics: Triggers
-- =====================================================
-- Trigger A: AFTER INSERT em messages → atualiza cache de métricas na conversation
-- Trigger B: BEFORE INSERT em conversations → marca se foi criada fora do expediente
-- =====================================================

-- ─── Trigger A: update conversation metrics on new message ────────────────────

CREATE OR REPLACE FUNCTION public.update_conversation_metrics_on_message()
RETURNS TRIGGER AS $$
DECLARE
    v_conv public.conversations%ROWTYPE;
    v_ref_timestamp TIMESTAMPTZ;
    v_duration_seconds INTEGER;
BEGIN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- 1. Última mensagem inbound (cliente) — usada para detectar abandono
    IF NEW.direction = 'inbound' THEN
        UPDATE public.conversations
        SET last_customer_message_at = NEW.created_at
        WHERE id = NEW.conversation_id;
    END IF;

    -- 2. Primeira resposta (outbound) — captura tempo, origem (IA ou humano)
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

    -- 3. Marca conversa como IA-handled (pelo menos 1 msg da IA)
    IF COALESCE(NEW.is_ai_response, false) = true AND COALESCE(v_conv.is_ai_handled, false) = false THEN
        UPDATE public.conversations
        SET is_ai_handled = true
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_update_conversation_metrics ON public.messages;
CREATE TRIGGER trg_update_conversation_metrics
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_metrics_on_message();

-- ─── Trigger B: mark conversation as outside business hours on creation ───────

CREATE OR REPLACE FUNCTION public.set_conversation_outside_business_hours()
RETURNS TRIGGER AS $$
DECLARE
    v_start INTEGER;
    v_end INTEGER;
    v_work_days INTEGER[];
    v_local_hour INTEGER;
    v_local_dow INTEGER;
BEGIN
    SELECT start_hour, end_hour, work_days
    INTO v_start, v_end, v_work_days
    FROM public.scheduling_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    IF NOT FOUND THEN
        -- Sem configuração → mantém NULL (não classifica)
        RETURN NEW;
    END IF;

    -- Timezone hardcoded em America/Sao_Paulo (clínicas BR)
    v_local_hour := EXTRACT(HOUR FROM NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER;
    v_local_dow := EXTRACT(DOW FROM NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

    NEW.is_outside_business_hours := NOT (
        v_local_dow = ANY(v_work_days)
        AND v_local_hour >= v_start
        AND v_local_hour < v_end
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_set_outside_business_hours ON public.conversations;
CREATE TRIGGER trg_set_outside_business_hours
    BEFORE INSERT ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_conversation_outside_business_hours();
