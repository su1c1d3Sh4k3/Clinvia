-- Status de entrega que chega DEPOIS do ticket ser encerrado.
--
-- Ao resolver a conversa, on_resolve_archive_history copia as mensagens para
-- conversations.messages_history e on_conversation_resolve APAGA as linhas de
-- messages. O recibo de entrega/leitura da Meta chega alguns segundos depois do
-- envio, quando a linha ja nao existe: o UPDATE do webhook-handle-status nao
-- acha nada e a mensagem fica congelada em "enviado" no historico.
-- Caso real: mensagem final do encerramento automatico (a conversa e encerrada
-- no mesmo instante do envio) — 18 de 19 ficaram em "enviado".
--
-- Correcao: guardar o wamid no item arquivado e deixar o webhook aplicar o
-- status direto no JSON quando a mensagem viva nao existir mais.

-- 1) Ordem dos status, para recibo fora de ordem nunca rebaixar o que ja chegou.
CREATE OR REPLACE FUNCTION public.message_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE lower(coalesce(p_status, ''))
        WHEN 'sent'      THEN 1
        WHEN 'delivered' THEN 2
        WHEN 'read'      THEN 3
        WHEN 'failed'    THEN 4
        ELSE 0
    END;
$function$;

-- 2) Itens arquivados passam a carregar evolution_id (o wamid da Meta).
CREATE OR REPLACE FUNCTION public.archive_messages_before_resolve()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    -- Only run if status is changing to 'resolved'
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN

        NEW.messages_history := (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
                    -- Prioritize transcription over body
                    'content', COALESCE(transcription, body, '[Mídia]'),
                    'transcription', transcription,
                    'type', message_type,
                    'media_url', media_url,
                    'status', status,
                    'evolution_id', evolution_id,
                    'sender_name', sender_name,
                    'created_at', created_at
                ) ORDER BY created_at ASC
            )
            FROM public.messages
            WHERE conversation_id = NEW.id
        );
        IF NEW.messages_history IS NULL THEN
            NEW.messages_history := '[]'::jsonb;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_history_on_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    parent_conversation_status TEXT;
BEGIN
    SELECT status INTO parent_conversation_status
    FROM public.conversations
    WHERE id = NEW.conversation_id;
    IF parent_conversation_status = 'resolved' THEN
        UPDATE public.conversations
        SET messages_history = (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'role', CASE WHEN direction = 'inbound' THEN 'user' ELSE 'assistant' END,
                    -- Prioritize transcription over body
                    'content', COALESCE(transcription, body, '[Mídia]'),
                    'transcription', transcription,
                    'type', message_type,
                    'media_url', media_url,
                    'status', status,
                    'evolution_id', evolution_id,
                    'sender_name', sender_name,
                    'created_at', created_at
                ) ORDER BY created_at ASC
            )
            FROM public.messages
            WHERE conversation_id = NEW.conversation_id
        )
        WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$function$;

-- 3) Achar a conversa recem-encerrada sem varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_conversations_resolved_at_resolved
    ON public.conversations (resolved_at DESC)
    WHERE status = 'resolved';

-- 4) Aplica o status no item arquivado. Janela curta: o recibo de entrega chega
--    em segundos; depois disso o ticket ja saiu do radar e o custo nao se paga.
CREATE OR REPLACE FUNCTION public.apply_archived_message_status(
    p_wamid text,
    p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_conversation_id uuid;
    v_new_rank integer;
    v_changed integer;
BEGIN
    IF p_wamid IS NULL OR p_status IS NULL THEN
        RETURN false;
    END IF;

    v_new_rank := public.message_status_rank(p_status);
    IF v_new_rank = 0 THEN
        RETURN false;
    END IF;

    SELECT c.id INTO v_conversation_id
    FROM public.conversations c
    WHERE c.status = 'resolved'
      AND c.resolved_at > now() - interval '15 minutes'
      AND jsonb_typeof(c.messages_history) = 'array'
      AND c.messages_history @> jsonb_build_array(jsonb_build_object('evolution_id', p_wamid))
    ORDER BY c.resolved_at DESC
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE public.conversations c
    SET messages_history = (
        SELECT jsonb_agg(
            CASE
                WHEN item->>'evolution_id' = p_wamid
                 AND public.message_status_rank(item->>'status') < v_new_rank
                THEN item || jsonb_build_object('status', p_status)
                ELSE item
            END
            ORDER BY ord
        )
        FROM jsonb_array_elements(c.messages_history) WITH ORDINALITY AS t(item, ord)
    )
    WHERE c.id = v_conversation_id
      -- recibo fora de ordem nao rebaixa o status nem reescreve o historico a toa
      AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(c.messages_history) AS item
          WHERE item->>'evolution_id' = p_wamid
            AND public.message_status_rank(item->>'status') < v_new_rank
      );

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN v_changed > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_archived_message_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_archived_message_status(text, text) TO service_role;
