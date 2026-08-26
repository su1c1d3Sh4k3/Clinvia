-- Follow-up: cada contato pode ser listado UMA UNICA VEZ por etapa (follow_number).
--
-- Problema (caso Bruno / PELE 25-08): a conta tem 3 instancias compartilhando o
-- MESMO workflow_code, entao o n8n chama api-followup-pending 3x simultaneamente.
-- A RPC nao tinha nenhuma marcacao de "ja entreguei este contato", entao as 3
-- chamadas retornavam o mesmo contato e o cliente recebeu 3 follow-ups seguidos
-- (follow_number pulou 0 -> 3 em segundos, queimando as 3 etapas de uma vez).
--
-- Solucao: coluna de claim em contacts + UPDATE atomico dentro da propria RPC.
-- Quem consegue gravar followup_claimed_number = follow_number leva o contato;
-- as chamadas concorrentes serializam no lock da linha, reavaliam o WHERE contra
-- a versao nova e retornam 0 linhas. Quando o cliente responde, o n8n zera
-- follow_number -> volta a ser DISTINCT do claim -> o contato entra de novo.

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS followup_claimed_number INTEGER;

COMMENT ON COLUMN public.contacts.followup_claimed_number IS
    'Ultima etapa de follow-up (follow_number) ja entregue por get_followup_pending_contacts. Garante 1 entrega por etapa mesmo com chamadas concorrentes.';

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
            c.id AS contact_id,
            c.number AS c_number,
            c.push_name AS c_push_name,
            c.last_message AS c_last_message,
            c.last_message_time AS c_last_message_time,
            c.follow_number AS c_follow_number,
            c.user_id AS c_user_id,
            conv.conv_id,
            conv.conv_instance_id
        FROM contacts c
        JOIN LATERAL (
            SELECT cv.id AS conv_id, cv.instance_id AS conv_instance_id
            FROM conversations cv
            JOIN queues q ON q.id = cv.queue_id
            WHERE cv.contact_id = c.id
              AND cv.user_id = p_user_id
              AND cv.status = 'pending'
              AND q.name = 'Atendimento IA'
            ORDER BY cv.last_message_at DESC NULLS LAST
            LIMIT 1
        ) conv ON TRUE
        WHERE c.user_id = p_user_id
          AND c.ia_on = TRUE
          AND c.last_message = 'enviada'
          AND c.is_group = FALSE
          AND c.last_message_time < (NOW() - (p_minutes || ' minutes')::INTERVAL)
          AND (p_follow_number IS NULL OR c.follow_number = p_follow_number)
          AND c.followup_claimed_number IS DISTINCT FROM c.follow_number
          AND NOT EXISTS (
              SELECT 1 FROM crm_client cc
              WHERE cc.contact_id = c.id
                AND cc.user_id = p_user_id
                AND cc.is_active = TRUE
                AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
          )
    ),
    reservados AS (
        UPDATE contacts c2
        SET followup_claimed_number = c2.follow_number
        FROM candidatos cand
        WHERE c2.id = cand.contact_id
          AND c2.followup_claimed_number IS DISTINCT FROM c2.follow_number
        RETURNING c2.id
    )
    SELECT
        cand.contact_id,
        cand.c_number,
        cand.c_push_name,
        cand.c_last_message,
        TO_CHAR(
            cand.c_last_message_time AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
        ),
        cand.c_follow_number,
        cand.c_user_id,
        cand.conv_id,
        cand.conv_instance_id
    FROM candidatos cand
    JOIN reservados r ON r.id = cand.contact_id;
END;
$function$;

-- Contatos que ja receberam follow-up antes desta correcao nao devem ser
-- reentregues na etapa em que ja estao.
UPDATE public.contacts
SET followup_claimed_number = follow_number
WHERE follow_number > 0
  AND followup_claimed_number IS DISTINCT FROM follow_number;
