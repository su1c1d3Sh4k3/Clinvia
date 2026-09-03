-- Encerramento automático NÃO pode fechar ticket dentro do ciclo de confirmação
-- de agendamento: da mensagem de confirmação (D-1) até a pesquisa NPS (D+1) ser
-- respondida ou expirar. Quem fecha esses tickets é o próprio fluxo
-- (appointment-confirmation-respond ao responder a pesquisa, ou o timeout de 24h
-- do appointment-confirmation-cron).

CREATE INDEX IF NOT EXISTS idx_acs_conv_appt_date
    ON public.appointment_confirmation_sessions (conversation_id, appointment_date);

CREATE OR REPLACE FUNCTION public.auto_close_scan()
 RETURNS TABLE(conv_id uuid, owner_id uuid, contact_ref uuid, action text, msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Cliente respondeu depois do aviso ⇒ cancela o ciclo (nova janela de 24h)
    UPDATE conversations c
    SET auto_close_warning_at = NULL
    WHERE c.auto_close_warning_at IS NOT NULL
      AND c.last_customer_message_at > c.auto_close_warning_at;

    RETURN QUERY
    WITH base AS (
        SELECT c.id,
               c.user_id,
               c.contact_id,
               c.last_customer_message_at AS last_cust,
               c.auto_close_warning_at    AS warned_at,
               c.created_at,
               p.auto_close_enabled,
               p.auto_close_no_interaction_enabled,
               p.auto_close_no_interaction_hours,
               p.auto_close_warning_message,
               p.auto_close_final_message,
               -- Meta: tempos fixos 22h30/23h30 (nunca estoura a janela de 24h)
               CASE WHEN (i.provider = 'meta' OR i.instance_name LIKE 'meta%')
                    THEN 1350 ELSE p.auto_close_warning_minutes END AS warn_min,
               CASE WHEN (i.provider = 'meta' OR i.instance_name LIKE 'meta%')
                    THEN 1410 ELSE p.auto_close_final_minutes END   AS final_min
        FROM conversations c
        JOIN profiles  p ON p.id = c.user_id
        JOIN instances i ON i.id = c.instance_id
        WHERE c.status IN ('open','pending')
          AND c.group_id IS NULL
          AND c.instance_id IS NOT NULL
          -- Ciclo de confirmação em curso ⇒ imune ao encerramento automático.
          -- Vale até o fim de D+2 (a pesquisa NPS sai em D+1 e o cron encerra a
          -- sessão parada em 24h) ou até a pesquisa daquele agendamento terminar.
          AND NOT EXISTS (
              SELECT 1
              FROM appointment_confirmation_sessions s
              WHERE s.conversation_id = c.id
                AND now() < (s.appointment_date + 3)::timestamptz
                AND NOT EXISTS (
                    SELECT 1
                    FROM appointment_confirmation_sessions f
                    WHERE f.conversation_id = s.conversation_id
                      AND f.appointment_date = s.appointment_date
                      AND f.flow_type = 'feedback_24h'
                      AND f.state IN ('completed','transferred','failed')
                )
          )
    ), classified AS (
        SELECT b.*,
            CASE
                -- aviso enviado, sem resposta, chegou a hora final ⇒ encerra c/ msg
                WHEN b.auto_close_enabled AND b.last_cust IS NOT NULL
                     AND b.warned_at IS NOT NULL
                     AND now() >= b.last_cust + make_interval(mins => b.final_min)
                THEN 'close'
                -- já passou do limite final SEM aviso (backlog/cron parado):
                -- janela Meta já era — encerra em silêncio
                WHEN b.auto_close_enabled AND b.last_cust IS NOT NULL
                     AND b.warned_at IS NULL
                     AND now() >= b.last_cust + make_interval(mins => b.final_min)
                THEN 'close_silent'
                -- hora do aviso
                WHEN b.auto_close_enabled AND b.last_cust IS NOT NULL
                     AND b.warned_at IS NULL
                     AND now() >= b.last_cust + make_interval(mins => b.warn_min)
                THEN 'warning'
                -- cliente nunca interagiu
                WHEN b.auto_close_no_interaction_enabled AND b.last_cust IS NULL
                     AND now() >= b.created_at + make_interval(hours => b.auto_close_no_interaction_hours)
                THEN 'close_silent'
            END AS v_action
        FROM base b
    )
    SELECT cl.id,
           cl.user_id,
           cl.contact_id,
           cl.v_action,
           CASE cl.v_action
               WHEN 'warning' THEN cl.auto_close_warning_message
               WHEN 'close'   THEN cl.auto_close_final_message
           END
    FROM classified cl
    WHERE cl.v_action IS NOT NULL
    ORDER BY cl.last_cust NULLS LAST
    LIMIT 200;
END $function$;
