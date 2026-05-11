-- =====================================================
-- Denormalizar a última mensagem em conversations
-- =====================================================
-- Antes: useConversations fazia 1 query para listar conversas + N queries
-- paralelas para buscar a última mensagem de cada uma (N+1 query problem).
-- Mesmo com paginação 20 em 20, isso significava 21 round-trips no boot.
--
-- Agora: as colunas last_message_* são mantidas atualizadas via trigger
-- AFTER INSERT/UPDATE/DELETE em messages. Frontend lê tudo numa única
-- query, sem JOIN nem N+1.
-- =====================================================

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS last_message_body TEXT,
    ADD COLUMN IF NOT EXISTS last_message_direction TEXT,
    ADD COLUMN IF NOT EXISTS last_message_status TEXT,
    ADD COLUMN IF NOT EXISTS last_message_type TEXT;

COMMENT ON COLUMN public.conversations.last_message_body
    IS 'Texto/legenda da última mensagem (mantido por trigger AFTER INSERT messages). Evita N+1 query no carregamento da lista.';
COMMENT ON COLUMN public.conversations.last_message_direction
    IS 'inbound | outbound | system — direção da última mensagem.';
COMMENT ON COLUMN public.conversations.last_message_status
    IS 'sent | delivered | read | failed — status da última mensagem outbound.';
COMMENT ON COLUMN public.conversations.last_message_type
    IS 'text | image | audio | document | reaction | etc — tipo da última mensagem.';

-- Índice de suporte para queries de fallback / scripts ad-hoc
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
    ON public.messages (conversation_id, created_at DESC)
    WHERE is_deleted = false;

-- =====================================================
-- Trigger: atualiza last_message_* na conversa quando uma mensagem é criada
-- =====================================================
-- Filtros aplicados (matchando o frontend antigo):
--   - Ignora mensagens "transferida de" / "transferiu para" (system noise)
--   - Ignora mensagens soft-deletadas (is_deleted = true)
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_body TEXT;
BEGIN
    -- Filtra mensagens system-noise e deletadas
    v_body := COALESCE(NEW.body, '');
    IF NEW.is_deleted = true
       OR v_body ILIKE '%transferida de%'
       OR v_body ILIKE '%transferiu para%' THEN
        RETURN NEW;
    END IF;

    UPDATE public.conversations
    SET last_message_body = v_body,
        last_message_direction = NEW.direction::text,
        last_message_status = NEW.status,
        last_message_type = NEW.message_type::text,
        -- last_message_at já existe e é atualizado por outro trigger,
        -- mas garante sincronia se o created_at é mais novo
        last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_conversation_last_message ON public.messages;
CREATE TRIGGER trg_update_conversation_last_message
    AFTER INSERT OR UPDATE OF body, status, message_type, is_deleted ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_last_message();

-- =====================================================
-- Backfill — popula as colunas com a última mensagem atual de cada conversa
-- =====================================================
-- Usa LATERAL JOIN: para cada conversa, pega a última mensagem válida.
-- Roda uma vez na aplicação da migration; depois o trigger mantém atualizado.
-- =====================================================

WITH last_msgs AS (
    SELECT c.id AS conv_id, lm.body, lm.direction, lm.status, lm.message_type
    FROM public.conversations c
    LEFT JOIN LATERAL (
        SELECT body, direction, status, message_type
        FROM public.messages
        WHERE conversation_id = c.id
          AND is_deleted = false
          AND body NOT ILIKE '%transferida de%'
          AND body NOT ILIKE '%transferiu para%'
        ORDER BY created_at DESC
        LIMIT 1
    ) lm ON true
    WHERE c.last_message_body IS NULL  -- só popula vazias (rerun safe)
)
UPDATE public.conversations c
SET last_message_body = lm.body,
    last_message_direction = lm.direction::text,
    last_message_status = lm.status,
    last_message_type = lm.message_type::text
FROM last_msgs lm
WHERE c.id = lm.conv_id
  AND lm.body IS NOT NULL;
