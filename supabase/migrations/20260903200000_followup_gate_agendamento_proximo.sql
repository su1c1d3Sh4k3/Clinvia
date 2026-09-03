-- =============================================================================
-- Follow-up: agendamento nas próximas 24h desliga o follow-up
-- =============================================================================
-- As mensagens automáticas (confirmação em start-24h, lembrete em start-2h)
-- assumem a conversa nesse intervalo. Sem este gate o follow-up caía em cima
-- delas sempre que o contato não tinha card ativo em etapa bloqueante — 407 de
-- 692 sessões de confirm_24h dos últimos 7 dias estavam exatamente assim.
--
-- As etapas 'Agendado' e 'Pesquisa de Satisfação' já bloqueavam antes; ficam
-- como estão. O que faltava era o caso do contato SEM card na etapa certa.
--
-- Escopo por contato (não por canal): appointments não tem instance_id, e o
-- agendamento é do cliente, não da conexão.
-- =============================================================================

-- Sustenta o NOT EXISTS: sem isso o gate faz seq scan em appointments a cada
-- poll do follow-up.
CREATE INDEX IF NOT EXISTS idx_appointments_contact_start_time
    ON public.appointments (contact_id, start_time)
    WHERE status IN ('pending', 'confirmed', 'rescheduled', 'waiting');

CREATE OR REPLACE FUNCTION public.get_followup_pending_contacts(
    p_user_id uuid,
    p_minutes integer,
    p_follow_number integer DEFAULT NULL::integer
)
RETURNS TABLE(
    id uuid,
    number text,
    push_name text,
    last_message text,
    last_message_time text,
    follow_number integer,
    user_id uuid,
    conversation_id uuid,
    instance_id uuid
)
LANGUAGE plpgsql
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
          -- card bloqueante precisa ser DO MESMO CANAL (ou sentinela legado):
          -- card 'Agendado' na instancia A nao pode matar o follow-up da B
          AND NOT EXISTS (
              SELECT 1 FROM crm_client cc
              WHERE cc.contact_id = c.id
                AND cc.user_id = p_user_id
                AND cc.is_active = TRUE
                AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
                AND (
                    (cc.instance_id IS NOT DISTINCT FROM cv.instance_id
                     AND cc.instagram_instance_id IS NOT DISTINCT FROM cv.instagram_instance_id)
                    OR (cc.instance_id IS NULL AND cc.instagram_instance_id IS NULL)
                )
          )
          -- agendamento nas proximas 24h: a confirmacao (start-24h) e o lembrete
          -- (start-2h) sao os donos da conversa nessa janela
          AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.contact_id = c.id
                AND a.user_id = p_user_id
                AND a.type = 'appointment'
                AND a.status IN ('pending', 'confirmed', 'rescheduled', 'waiting')
                AND a.start_time >= NOW()
                AND a.start_time <= NOW() + INTERVAL '24 hours'
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
