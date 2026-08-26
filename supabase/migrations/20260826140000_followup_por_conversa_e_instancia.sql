-- Follow-up por CONVERSA (nao por contato).
--
-- Regra do usuario: a API deve responder uma vez para cada instancia que tem a
-- IA ligada nela. Se o contato tem conversa em 2 instancias e as duas estao com
-- IA ligada, retorna as 2 linhas — cada uma com seu conversation_id, sua
-- instance_id e seu proprio tempo de ultima mensagem. Se so uma instancia esta
-- com a IA ligada, retorna APENAS a conversa dessa instancia.
--
-- Isso substitui o claim por contato (20260826130000): a unidade de entrega
-- agora e a conversa, entao o marcador vive em conversations.

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS followup_claimed_number INTEGER;

COMMENT ON COLUMN public.conversations.followup_claimed_number IS
    'Ultima etapa de follow-up (contacts.follow_number) ja entregue para ESTA conversa por get_followup_pending_contacts. Garante 1 entrega por etapa por conversa, mesmo com chamadas concorrentes.';

-- herda o claim que estava no contato, para nao reentregar quem ja recebeu
UPDATE public.conversations cv
SET followup_claimed_number = c.follow_number
FROM public.contacts c
WHERE c.id = cv.contact_id
  AND c.follow_number > 0
  AND cv.followup_claimed_number IS DISTINCT FROM c.follow_number;

ALTER TABLE public.contacts DROP COLUMN IF EXISTS followup_claimed_number;

CREATE OR REPLACE FUNCTION public.get_followup_pending_contacts(
    p_user_id UUID,
    p_minutes INTEGER,
    p_follow_number INTEGER DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    number TEXT,
    push_name TEXT,
    last_message TEXT,
    last_message_time TEXT,
    follow_number INTEGER,
    user_id UUID,
    conversation_id UUID,
    instance_id UUID
)
LANGUAGE plpgsql
VOLATILE
AS $function$
BEGIN
    RETURN QUERY
    WITH candidatos AS (
        SELECT
            cv.id AS conv_id,
            cv.instance_id AS conv_instance_id,
            cv.last_message_at AS conv_last_message_at,
            c.id AS contact_id,
            c.number AS c_number,
            c.push_name AS c_push_name,
            c.last_message AS c_last_message,
            c.follow_number AS c_follow_number,
            c.user_id AS c_user_id
        FROM conversations cv
        JOIN queues q ON q.id = cv.queue_id AND q.name = 'Atendimento IA'
        JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.user_id = p_user_id
          AND cv.status = 'pending'
          AND c.user_id = p_user_id
          AND c.ia_on = TRUE
          AND c.is_group = FALSE
          AND (p_follow_number IS NULL OR c.follow_number = p_follow_number)
          AND cv.last_message_at IS NOT NULL
          AND cv.last_message_at < (NOW() - (p_minutes || ' minutes')::INTERVAL)
          -- a ultima mensagem DESTA conversa precisa ter sido nossa
          AND (
              CASE
                  WHEN cv.last_customer_message_at IS NOT NULL
                      THEN cv.last_message_at > cv.last_customer_message_at
                  ELSE c.last_message = 'enviada'
              END
          )
          -- a instancia da conversa precisa estar com a IA ligada
          -- (instance_id NULL = Instagram, mesma convencao do guard de fila)
          AND (
              cv.instance_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM instances i
                  WHERE i.id = cv.instance_id AND i.ia_on_wpp IS TRUE
              )
          )
          -- entrega unica por etapa, por conversa
          AND cv.followup_claimed_number IS DISTINCT FROM c.follow_number
          AND NOT EXISTS (
              SELECT 1 FROM crm_client cc
              WHERE cc.contact_id = c.id
                AND cc.user_id = p_user_id
                AND cc.is_active = TRUE
                AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
          )
    ),
    reservados AS (
        UPDATE conversations cv2
        SET followup_claimed_number = cand.c_follow_number
        FROM candidatos cand
        WHERE cv2.id = cand.conv_id
          AND cv2.followup_claimed_number IS DISTINCT FROM cand.c_follow_number
        RETURNING cv2.id
    )
    SELECT
        cand.contact_id,
        cand.c_number,
        cand.c_push_name,
        cand.c_last_message,
        TO_CHAR(
            cand.conv_last_message_at AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
        ),
        cand.c_follow_number,
        cand.c_user_id,
        cand.conv_id,
        cand.conv_instance_id
    FROM candidatos cand
    JOIN reservados r ON r.id = cand.conv_id
    ORDER BY cand.conv_last_message_at ASC;
END;
$function$;
