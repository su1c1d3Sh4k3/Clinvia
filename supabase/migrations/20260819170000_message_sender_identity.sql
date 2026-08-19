-- User rule: o remetente de CADA mensagem deve aparecer no front do inbox,
-- mesmo com a assinatura de WhatsApp (sign_messages) desligada — a assinatura
-- controla só o que vai pro WhatsApp; o front exibe sempre.
--
-- 1) Backfill retroativo: mensagens outbound assinadas guardam o nome no corpo
--    como "*Nome:*\n..." — extrai pra messages.sender_name (idem caption de docs).
-- 2) Arquivamento (conversa resolvida) passa a preservar sender_name no JSON de
--    messages_history — senão o nome some ao resolver o ticket.
--    (Histórico já arquivado mantém o prefixo "*Nome:*" no content — o front
--    tem fallback de parse, então não precisa reescrever o JSON antigo.)

SET lock_timeout = '5s';

-- 1) Backfill retroativo a partir do prefixo de assinatura
UPDATE public.messages
SET sender_name = substring(body from '^\*([^*]+):\*')
WHERE direction = 'outbound'
  AND sender_name IS NULL
  AND body ~ '^\*[^*]+:\*\n';

UPDATE public.messages
SET sender_name = substring(caption from '^\*([^*]+):\*')
WHERE direction = 'outbound'
  AND sender_name IS NULL
  AND caption ~ '^\*[^*]+:\*\n';

-- 2) Arquivamento preserva sender_name
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
