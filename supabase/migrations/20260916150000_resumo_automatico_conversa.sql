-- Resumo automático de TODA conversa encerrada.
--
-- USER RULE: sempre que uma conversa vira 'resolved', em qualquer circunstância,
-- a IA gera o resumo DAQUELA conversa. Cada ticket é uma linha própria em
-- `conversations` (webhook-handle-message nunca reabre conversa resolvida — ele
-- cria uma nova), então 5 tickets no histórico = 5 resumos individuais, cada um
-- cobrindo somente as mensagens do seu ticket.
--
-- Antes desta migração o resumo só existia dentro de `resolve-ticket`, chamada
-- exclusivamente pelo botão "Finalizar" do inbox. Todo o resto — encerramento
-- automático, etapa terminal do CRM, fechamento/takeover de campanha, api-crm,
-- confirmação de agendamento, automação de entrega, Instagram, monitoramento —
-- escrevia status='resolved' direto e não gerava resumo nenhum (12.328 de 16.389
-- conversas resolvidas estavam sem resumo).
--
-- O gatilho não pode chamar a IA de dentro do trigger (encerrar ficaria refém de
-- uma chamada HTTP lenta e um erro da OpenAI abortaria a transação), então a
-- conversa entra numa fila e o worker `conversation-summary-worker` processa.

-- ── fila ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_summary_queue (
    conversation_id UUID PRIMARY KEY
        REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    -- 0 = ticket recém-encerrado (fura a fila), 1 = backfill do histórico
    priority     SMALLINT NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    attempts     SMALLINT NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.conversation_summary_queue IS
    'Conversas encerradas aguardando o resumo da IA. Alimentada por trg_conversation_summary_enqueue, consumida por conversation-summary-worker.';

CREATE INDEX IF NOT EXISTS idx_conversation_summary_queue_pending
    ON public.conversation_summary_queue (priority, created_at)
    WHERE status = 'pending';

-- Fila interna: só o service_role (worker) enxerga.
ALTER TABLE public.conversation_summary_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_summary_queue FROM anon, authenticated;

-- ── gatilho: qualquer caminho que resolve a conversa enfileira ──────────────
CREATE OR REPLACE FUNCTION public.enqueue_conversation_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status::TEXT <> 'resolved' OR OLD.status::TEXT = 'resolved' THEN
        RETURN NULL;
    END IF;

    -- archive_messages_before_resolve (BEFORE) já materializou o histórico do
    -- ticket; ticket sem nenhuma mensagem não tem o que resumir.
    IF jsonb_typeof(NEW.messages_history) <> 'array'
       OR jsonb_array_length(NEW.messages_history) = 0 THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.conversation_summary_queue (conversation_id, user_id, priority)
    VALUES (NEW.id, NEW.user_id, 0)
    ON CONFLICT (conversation_id) DO UPDATE
        SET status = 'pending',
            priority = 0,
            attempts = 0,
            last_error = NULL,
            processed_at = NULL,
            created_at = now();

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_conversation_summary_enqueue ON public.conversations;
CREATE TRIGGER zz_conversation_summary_enqueue
AFTER UPDATE OF status ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_conversation_summary();

-- ── claim atômico (rodadas concorrentes não pegam a mesma conversa) ─────────
CREATE OR REPLACE FUNCTION public.claim_conversation_summaries(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (conversation_id UUID, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH alvo AS (
        SELECT q.conversation_id
        FROM public.conversation_summary_queue q
        WHERE q.status = 'pending'
        ORDER BY q.priority, q.created_at
        LIMIT GREATEST(p_limit, 1)
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.conversation_summary_queue q
    SET status = 'processing',
        attempts = q.attempts + 1
    FROM alvo a
    WHERE q.conversation_id = a.conversation_id
    RETURNING q.conversation_id, q.user_id;
END;
$$;

-- ── gravação do resultado, em uma transação só ─────────────────────────────
-- conversations.summary alimenta a aba Resumos do modal do cliente e o ticket
-- no inbox; ai_analysis alimenta a lateral de inteligência; contacts.quality
-- alimenta a nota de qualidade da lista de contatos.
-- p_append_quality: só o resumo do encerramento entra na média de qualidade do
-- contato. Reprocessar pelo botão "Gerar Resumo" não pode inflar a nota.
CREATE OR REPLACE FUNCTION public.finish_conversation_summary(
    p_conversation_id UUID,
    p_summary TEXT,
    p_sentiment_score NUMERIC,
    p_speed_score NUMERIC,
    p_append_quality BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_contact_id UUID;
    v_owner_id UUID;
BEGIN
    UPDATE public.conversations
    SET summary = p_summary,
        sentiment_score = p_sentiment_score
    WHERE id = p_conversation_id
    RETURNING contact_id, user_id INTO v_contact_id, v_owner_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.ai_analysis (conversation_id, user_id, summary, sentiment_score, speed_score, last_updated)
    VALUES (p_conversation_id, v_owner_id, p_summary, p_sentiment_score, p_speed_score, now())
    ON CONFLICT (conversation_id) DO UPDATE
        SET summary = EXCLUDED.summary,
            sentiment_score = EXCLUDED.sentiment_score,
            speed_score = EXCLUDED.speed_score,
            last_updated = EXCLUDED.last_updated;

    IF p_append_quality AND v_contact_id IS NOT NULL AND p_sentiment_score IS NOT NULL THEN
        -- contacts.quality é numeric[] (não jsonb)
        UPDATE public.contacts
        SET quality = array_append(COALESCE(quality, ARRAY[]::numeric[]), p_sentiment_score)
        WHERE id = v_contact_id;
    END IF;

    UPDATE public.conversation_summary_queue
    SET status = 'done', last_error = NULL, processed_at = now()
    WHERE conversation_id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_conversation_summary(
    p_conversation_id UUID,
    p_error TEXT,
    p_max_attempts INTEGER DEFAULT 3
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    UPDATE public.conversation_summary_queue
    SET status = CASE WHEN attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
        last_error = left(coalesce(p_error, 'erro desconhecido'), 500),
        processed_at = now()
    WHERE conversation_id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation_summaries(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_conversation_summary(UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_conversation_summary(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_conversation_summaries(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_conversation_summary(UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_conversation_summary(UUID, TEXT, INTEGER) TO service_role;

-- ── invoke + pg_cron a cada minuto ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoke_conversation_summary_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
    v_pendentes INTEGER;
BEGIN
    SELECT count(*) INTO v_pendentes
    FROM public.conversation_summary_queue
    WHERE status = 'pending';

    IF v_pendentes = 0 THEN
        RETURN;
    END IF;

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/conversation-summary-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'conversation-summary-worker invoke error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_conversation_summary_worker() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('conversation-summary-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('conversation-summary-worker','* * * * *',
    $CRON$SELECT public.invoke_conversation_summary_worker()$CRON$);

-- ── backfill: toda conversa resolvida que ainda não tem resumo ──────────────
-- Prioridade 1: nunca atrasa o resumo de um ticket recém-encerrado.
INSERT INTO public.conversation_summary_queue (conversation_id, user_id, priority)
SELECT c.id, c.user_id, 1
FROM public.conversations c
WHERE c.status = 'resolved'
  AND (c.summary IS NULL OR btrim(c.summary) = '' OR c.summary = 'Sem mensagens para analisar.')
  AND jsonb_typeof(c.messages_history) = 'array'
  AND jsonb_array_length(c.messages_history) > 0
ON CONFLICT (conversation_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
