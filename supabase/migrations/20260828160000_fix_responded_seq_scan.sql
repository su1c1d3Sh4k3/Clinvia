-- HOTFIX: o overload 3-arg de campaign_contact_responded (20260828150000)
-- colocou a escolha da conversa dentro do WHERE:
--
--   WHERE (CASE WHEN p_conversation_id IS NOT NULL
--               THEN cv.id = p_conversation_id
--               ELSE cv.contact_id = p_contact_id END)
--
-- Um CASE como predicado nao e sargable: o planner nao consegue usar a PK de
-- conversations nem o indice de contact_id, entao cada chamada fazia SEQ SCAN
-- da tabela inteira. Como a funcao roda uma vez por entry, o dashboard de
-- campanhas passou de segundos para ~70s e estourava o statement_timeout do
-- PostgREST (aba Campanhas vazia).
--
-- Fix: dois EXISTS separados, escolhidos por um CASE no NIVEL DE CIMA -- cada
-- ramo vira um acesso indexado limpo.

CREATE OR REPLACE FUNCTION public.campaign_contact_responded(
    p_conversation_id uuid,
    p_contact_id uuid,
    p_sent_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT CASE
    WHEN p_sent_at IS NULL THEN FALSE
    -- escopo normal: a conversa que a propria campanha abriu
    WHEN p_conversation_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.id = p_conversation_id
          AND (
            EXISTS (
                SELECT 1 FROM messages m
                WHERE m.conversation_id = cv.id
                  AND m.direction = 'inbound'
                  AND m.created_at > p_sent_at
            )
            OR (
                jsonb_typeof(cv.messages_history) = 'array'
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(cv.messages_history) e
                    WHERE e->>'role' = 'user'
                      AND e->>'created_at' IS NOT NULL
                      AND (e->>'created_at')::timestamptz > p_sent_at
                )
            )
          )
    )
    -- reserva: campanhas antigas sem conversation_id
    WHEN p_contact_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.contact_id = p_contact_id
          AND (
            EXISTS (
                SELECT 1 FROM messages m
                WHERE m.conversation_id = cv.id
                  AND m.direction = 'inbound'
                  AND m.created_at > p_sent_at
            )
            OR (
                jsonb_typeof(cv.messages_history) = 'array'
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(cv.messages_history) e
                    WHERE e->>'role' = 'user'
                      AND e->>'created_at' IS NOT NULL
                      AND (e->>'created_at')::timestamptz > p_sent_at
                )
            )
          )
    )
    ELSE FALSE
END;
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_contact_responded(uuid, uuid, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
