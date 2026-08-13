-- Painel "Mensagens Automáticas" (dash Agendamentos) zerava para dias passados:
-- lia só messages, mas resolver a conversa DELETA as mensagens (arquiva em
-- conversations.messages_history). Caso 11/08 Fayruss: 65 envios sys_* todos
-- arquivados -> painel 0. Mesma classe do fix de get_meta_usage_24h (8aeda97).
--
-- 1) Arquivamento passa a preservar 'status' (entregue/lida/rejeitada) no JSON
-- 2) RPC get_automation_template_messages une vivos + arquivados

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

-- RPC: envios de templates de sistema (sys_*) vivos + arquivados no período.
-- Arquivados antigos não têm 'status' no JSON -> null (frontend mostra "Enviada").
CREATE OR REPLACE FUNCTION public.get_automation_template_messages(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(id text, body text, status text, created_at timestamptz,
              contact_id uuid, contact_name text, contact_phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT m.id::text, m.body, m.status, m.created_at,
       ct.id, ct.push_name, COALESCE(NULLIF(ct.phone, ''), split_part(ct.number, '@', 1))
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
LEFT JOIN contacts ct ON ct.id = c.contact_id
WHERE c.user_id = public.get_owner_id()
  AND m.direction = 'outbound'
  AND m.body LIKE '*Template enviado: sys\_%'
  AND m.created_at >= p_start
  AND m.created_at < p_end
UNION ALL
SELECT h.item->>'id', h.item->>'content', h.item->>'status',
       (h.item->>'created_at')::timestamptz,
       ct.id, ct.push_name, COALESCE(NULLIF(ct.phone, ''), split_part(ct.number, '@', 1))
FROM conversations c
LEFT JOIN contacts ct ON ct.id = c.contact_id
CROSS JOIN LATERAL jsonb_array_elements(c.messages_history) AS h(item)
WHERE c.user_id = public.get_owner_id()
  AND c.status = 'resolved'
  -- poda: mensagens arquivadas são sempre <= last_message_at da conversa
  AND c.last_message_at >= p_start
  AND c.created_at < p_end
  AND h.item->>'role' = 'assistant'
  AND h.item->>'content' LIKE '*Template enviado: sys\_%'
  AND (h.item->>'created_at')::timestamptz >= p_start
  AND (h.item->>'created_at')::timestamptz < p_end
ORDER BY created_at ASC;
$function$;
