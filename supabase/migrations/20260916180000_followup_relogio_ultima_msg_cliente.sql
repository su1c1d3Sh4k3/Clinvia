-- REGRA DO USER (2026-09-16): o follow-up é medido pelo horário da ÚLTIMA
-- MENSAGEM DO CLIENTE e NADA MAIS. Pílula de sistema JAMAIS pode influenciar.
--
-- Caso Bruno (PELE, conv b05c01b9-4581-4c52-a0a7-47f3990ea6ea):
--   13:56:53 cliente "Boa tarde" | 13:57:42 IA respondeu
--   14:13:24 pílula "O colaborador CHARLANNE NATHANY visualizou essa conversa"
--   14:20:01 n8n chamou api-followup-pending com min=15 -> found=0
-- A pílula é gravada em messages como outbound, o trigger empurrou
-- conversations.last_message_at para 14:13 e a RPC media a janela por ele:
-- 7 minutos de silêncio em vez dos 23 reais. O contato caiu fora do follow 1.
--
-- Três correções, nesta ordem:
--   1. last_customer_message_at nunca foi backfillado (894 de 1.085 conversas
--      pendentes na fila IA estavam NULL mesmo tendo mensagem do cliente).
--   2. o trigger para de deixar pílula mexer em last_message_at / contacts.
--   3. a RPC passa a medir por last_customer_message_at.

-- ── 1. Backfill do relógio ──────────────────────────────────────────────────
-- O trigger de métricas (20260424130100) só preenche a coluna em INSERT de
-- mensagem inbound; conversas anteriores a ele ficaram sem relógio nenhum.
WITH ultima_do_cliente AS (
    SELECT m.conversation_id, MAX(m.created_at) AS quando
      FROM public.messages m
      JOIN public.conversations cv ON cv.id = m.conversation_id
     WHERE cv.last_customer_message_at IS NULL
       AND m.direction::TEXT = 'inbound'
     GROUP BY m.conversation_id
)
UPDATE public.conversations cv
   SET last_customer_message_at = u.quando
  FROM ultima_do_cliente u
 WHERE cv.id = u.conversation_id
   AND cv.last_customer_message_at IS NULL;

-- ── 2. Pílula de sistema não mexe no relógio ────────────────────────────────
-- O teste v_is_real já existia (20260827130000) mas só valia para
-- awaiting_reply: last_message_at e contacts.last_message eram atualizados
-- incondicionalmente, inclusive para pílula.
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_body TEXT := COALESCE(NEW.body, '');
  v_is_real BOOLEAN;
BEGIN
  -- Mesmas exclusões da RPC get_last_messages_for_conversations: pílulas de
  -- sistema não são conversa — não contam como "última mensagem", não mudam
  -- quem está devendo resposta e NÃO reiniciam o relógio do follow-up.
  v_is_real :=
    v_body NOT LIKE '%transferida de%'
    AND v_body NOT LIKE '%transferiu para%'
    AND v_body NOT LIKE '👥 %entrou no grupo'
    AND v_body NOT LIKE '👥 %saiu do grupo'
    AND v_body NOT LIKE '%visualizou essa conversa%'
    AND v_body NOT LIKE '%finalizou essa conversa com a etapa%'
    AND COALESCE(NEW.message_type::TEXT, '') <> 'reaction';

  UPDATE conversations
  SET
    updated_at = NOW(),
    last_message_at = CASE WHEN v_is_real THEN NOW() ELSE last_message_at END,
    awaiting_reply = CASE
      WHEN v_is_real THEN (NEW.direction::TEXT = 'inbound')
      ELSE awaiting_reply
    END
  WHERE id = NEW.conversation_id;

  IF v_is_real THEN
    UPDATE contacts c
    SET
      last_message = CASE WHEN NEW.direction = 'outbound' THEN 'enviada' ELSE 'recebida' END,
      last_message_time = COALESCE(NEW.created_at, NOW()),
      updated_at = NOW()
    FROM conversations conv
    WHERE conv.id = NEW.conversation_id
      AND c.id = conv.contact_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Reparo das conversas já contaminadas ─────────────────────────────────
-- 952 conversas pendentes na fila IA estavam com last_message_at inflado por
-- pílula. Só mexe em conversa com mensagem viva (pending/open): em conversa
-- resolvida o histórico está arquivado e não há o que recalcular.
WITH ultima_real AS (
    SELECT m.conversation_id, MAX(m.created_at) AS quando
      FROM public.messages m
     WHERE m.body NOT LIKE '%transferida de%'
       AND m.body NOT LIKE '%transferiu para%'
       AND m.body NOT LIKE '👥 %entrou no grupo'
       AND m.body NOT LIKE '👥 %saiu do grupo'
       AND m.body NOT LIKE '%visualizou essa conversa%'
       AND m.body NOT LIKE '%finalizou essa conversa com a etapa%'
       AND COALESCE(m.message_type::TEXT, '') <> 'reaction'
     GROUP BY m.conversation_id
)
UPDATE public.conversations cv
   SET last_message_at = u.quando
  FROM ultima_real u
 WHERE cv.id = u.conversation_id
   AND cv.last_message_at > u.quando + INTERVAL '1 second';

-- ── 4. A RPC passa a medir pela última mensagem do cliente ──────────────────
-- Assinatura preservada (3 args; a sobrecarga de 2 foi dropada em bebf5e4 e
-- não pode voltar, senão chamada sem follow_number fica ambígua).
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
        -- devolve o horario que REGE o follow-up: a ultima fala do cliente
        TO_CHAR(
            cand.conv_last_customer_at AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
        ),
        cand.c_follow_number,
        cand.c_user_id,
        cand.conv_id,
        cand.conv_instance_id
    FROM candidatos cand
    JOIN reservados r ON r.id = cand.conv_id
    ORDER BY cand.conv_last_customer_at ASC;
END;
$function$;
