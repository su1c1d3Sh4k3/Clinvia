-- Uso 24h do painel Meta Quality não pode zerar quando conversas são resolvidas
-- (resolver deleta messages; outbound fica arquivado em conversations.messages_history).
-- RPC devolve o primeiro outbound por contato na janela, combinando messages + history.
CREATE OR REPLACE FUNCTION public.get_meta_usage_24h(p_instance_id uuid, p_since timestamptz)
RETURNS TABLE(contact_id uuid, first_outbound timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT t.contact_id, MIN(t.ts) AS first_outbound
FROM (
    SELECT cv.contact_id, m.created_at AS ts
    FROM conversations cv
    JOIN messages m ON m.conversation_id = cv.id
    WHERE cv.instance_id = p_instance_id
      AND m.direction = 'outbound'
      AND m.created_at >= p_since
    UNION ALL
    SELECT cv.contact_id, (e->>'created_at')::timestamptz AS ts
    FROM conversations cv
    CROSS JOIN LATERAL jsonb_array_elements(cv.messages_history) e
    WHERE cv.instance_id = p_instance_id
      AND cv.last_message_at >= p_since            -- poda: só convs com atividade na janela
      AND jsonb_typeof(cv.messages_history) = 'array'
      AND e->>'role' = 'assistant'
      AND e->>'created_at' IS NOT NULL
      AND (e->>'created_at')::timestamptz >= p_since
) t
WHERE t.contact_id IS NOT NULL
GROUP BY t.contact_id;
$function$;
