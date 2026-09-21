-- Follow-up da IA: Instagram com as mesmas regras do WhatsApp (user rule 2026-09-21)
--
-- 1) O portao da IA passa a conferir instagram_instances.ia_on_insta quando a
--    conversa e do Direct. Antes 'cv.instance_id IS NULL' passava SEM validar
--    nada — mesmo buraco que o guard de fila tinha.
-- 2) O retorno ganha instagram_instance_id e channel (no FIM, campos novos nao
--    deslocam os existentes) para o fluxo saber por onde responder: no
--    Instagram 'number' e 'instagram:<IGSID>', nunca um telefone, e
--    instance_id vem NULL.

DROP FUNCTION IF EXISTS public.get_followup_pending_contacts(uuid, integer, integer);

CREATE FUNCTION public.get_followup_pending_contacts(
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
    instance_id UUID,
    instagram_instance_id UUID,
    channel TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH candidatos AS (
        SELECT
            cv.id AS conv_id,
            cv.instance_id AS conv_instance_id,
            cv.instagram_instance_id AS conv_instagram_instance_id,
            cv.last_customer_message_at AS conv_last_customer_at,
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
          -- RELOGIO DO FOLLOW-UP: a ultima mensagem DO CLIENTE e nada mais.
          -- Sem mensagem do cliente nao ha o que medir (conversa so de campanha
          -- que ninguem respondeu, por exemplo) e a conversa fica de fora.
          AND cv.last_customer_message_at IS NOT NULL
          AND cv.last_customer_message_at < (NOW() - (p_minutes || ' minutes')::INTERVAL)
          -- ja respondemos: se quem falou por ultimo foi o cliente, a divida de
          -- resposta e nossa e follow-up nao tem cabimento. Desde 20260916180000
          -- last_message_at ignora pilula de sistema, entao essa comparacao e
          -- entre mensagens de verdade.
          AND cv.last_message_at IS NOT NULL
          AND cv.last_message_at > cv.last_customer_message_at
          -- a CONEXAO da conversa precisa estar com a IA ligada: ia_on_wpp no
          -- WhatsApp, ia_on_insta no Instagram (mesma regra da fila). Conversa
          -- legada sem canal nenhum segue passando.
          AND (
              CASE
                  WHEN cv.instance_id IS NOT NULL THEN EXISTS (
                      SELECT 1 FROM instances i
                      WHERE i.id = cv.instance_id AND i.ia_on_wpp IS TRUE
                  )
                  WHEN cv.instagram_instance_id IS NOT NULL THEN EXISTS (
                      SELECT 1 FROM instagram_instances ig
                      WHERE ig.id = cv.instagram_instance_id AND ig.ia_on_insta IS TRUE
                  )
                  ELSE TRUE
              END
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
        -- devolve o horario que REGE o follow-up: a ultima fala do cliente
        TO_CHAR(
            cand.conv_last_customer_at AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
        ),
        cand.c_follow_number,
        cand.c_user_id,
        cand.conv_id,
        cand.conv_instance_id,
        cand.conv_instagram_instance_id,
        CASE WHEN cand.conv_instagram_instance_id IS NOT NULL
             THEN 'instagram' ELSE 'whatsapp' END
    FROM candidatos cand
    JOIN reservados r ON r.id = cand.conv_id
    ORDER BY cand.conv_last_customer_at ASC;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_followup_pending_contacts(uuid, integer, integer)
    TO authenticated, anon, service_role;
