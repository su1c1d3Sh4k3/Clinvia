-- REGRA DO USER (2026-09-16): "Fechar conversas sem interação" passa a valer
-- para TODA conversa parada, não só para aquela em que o cliente nunca falou.
--
-- Antes: a sub-chave só pegava conversa com last_customer_message_at IS NULL
-- (disparo de campanha/confirmação que ninguém respondeu). Conversa em que o
-- cliente conversou e sumiu ficava aberta para sempre enquanto a chave mestra
-- estivesse desligada — caso Laura 💛 (PELE DERMATOLOGIA), parada desde 09/09
-- e ainda pendente com a sub-chave ligada em 48h.
--
-- Agora: passou o tempo sem interação, encerra. Por padrão só encerra quando a
-- ÚLTIMA MENSAGEM FOI DA EMPRESA (IA ou operador) — se o cliente é quem falou
-- por último, a dívida de resposta é nossa e o ticket continua aberto. Quem
-- quiser encerrar esses também liga o switch novo.

-- ── 1. Switch novo (default: NÃO encerra quem o cliente respondeu) ──────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS auto_close_no_interaction_include_customer BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.auto_close_no_interaction_include_customer IS
    'Encerramento por inatividade: TRUE também encerra conversas cuja última mensagem foi do cliente. Default FALSE (só encerra quando quem falou por último foi a empresa).';

-- ── 2. auto_close_scan com o relógio de ociosidade ──────────────────────────
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
               -- relógio da ociosidade: última mensagem de verdade da conversa.
               -- Desde 20260916180000 last_message_at ignora pílula de sistema,
               -- então abrir a conversa para olhar não reinicia a contagem.
               COALESCE(c.last_message_at, c.created_at) AS ocioso_desde,
               -- quem falou por último foi a empresa? (cliente que nunca falou
               -- entra aqui também, era o caso coberto pela regra antiga)
               (c.last_customer_message_at IS NULL
                OR (c.last_message_at IS NOT NULL
                    AND c.last_message_at > c.last_customer_message_at)) AS empresa_por_ultimo,
               p.auto_close_enabled,
               p.auto_close_no_interaction_enabled,
               p.auto_close_no_interaction_hours,
               p.auto_close_no_interaction_include_customer,
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
                -- conversa parada há tempo demais ⇒ encerra em silêncio.
                -- Padrão: só quando quem falou por último foi a empresa.
                WHEN b.auto_close_no_interaction_enabled
                     AND now() >= b.ocioso_desde + make_interval(hours => b.auto_close_no_interaction_hours)
                     AND (b.auto_close_no_interaction_include_customer OR b.empresa_por_ultimo)
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
    ORDER BY cl.ocioso_desde
    LIMIT 200;
END $function$;
