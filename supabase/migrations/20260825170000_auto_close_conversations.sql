-- Encerramento Automático de Mensagens (Configurações → Automações)
--
-- Regras (user, 2026-08-25):
-- - Timer conta SEMPRE a partir da última mensagem do CLIENTE (msgs da equipe
--   não reiniciam). Cliente respondeu depois do aviso ⇒ ciclo cancelado (nova
--   janela de 24h).
-- - API oficial (Meta): aviso às 22h30 e encerramento às 23h30 da última msg
--   do cliente — fixos, sempre DENTRO da janela de 24h (texto livre permitido).
-- - API não oficial (UAZAPI): mesmos padrões, ambos os tempos editáveis.
-- - Encerramento: envia mensagem final → resolve ticket → card ativo vai para
--   'Sem Contato' (terminal).
-- - "Fechar conversas sem interação": conversa em que o cliente NUNCA falou é
--   encerrada (sem mensagem) após N horas (default 48h).
-- - Escopo: conversas open/pending de WhatsApp; grupos e Instagram FORA.
-- - Tudo ligado por padrão; mensagens editáveis por conta.

-- ── Configurações por conta (profiles do dono) ──────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS auto_close_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_close_warning_minutes integer NOT NULL DEFAULT 1350,  -- 22h30
    ADD COLUMN IF NOT EXISTS auto_close_final_minutes integer NOT NULL DEFAULT 1410,    -- 23h30
    ADD COLUMN IF NOT EXISTS auto_close_warning_message text NOT NULL
        DEFAULT 'Caso não obtivermos retorno nos próximos 60 min, agradecemos seu contato e encerraremos seu atendimento',
    ADD COLUMN IF NOT EXISTS auto_close_final_message text NOT NULL
        DEFAULT 'Estamos encerrando seu atendimento por falta de contato, esperamos nos falar novamente',
    ADD COLUMN IF NOT EXISTS auto_close_no_interaction_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_close_no_interaction_hours integer NOT NULL DEFAULT 48;

-- USER DECISION (2026-08-25): contas JÁ existentes começam DESLIGADAS para não
-- impactar o backlog (1.7k+ convs paradas seriam encerradas em massa). Só contas
-- novas nascem com os defaults true; quem já usa liga manualmente quando quiser.
UPDATE public.profiles
SET auto_close_enabled = false,
    auto_close_no_interaction_enabled = false;

-- ── Estado por conversa: quando o aviso foi enviado ─────────────────────────
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS auto_close_warning_at timestamptz NULL;

-- Varredura só olha open/pending de WhatsApp fora de grupo
CREATE INDEX IF NOT EXISTS idx_conversations_auto_close
    ON public.conversations (last_customer_message_at)
    WHERE status IN ('open','pending') AND group_id IS NULL AND instance_id IS NOT NULL;

-- ── Varredura: cancela avisos respondidos + devolve candidatos ──────────────
-- Retorna até 200 linhas com action:
--   'warning'      → enviar mensagem de aviso (msg = auto_close_warning_message)
--   'close'        → enviar mensagem final e encerrar (msg = auto_close_final_message)
--   'close_silent' → encerrar SEM mensagem (backlog já além do limite — janela
--                    Meta fechada — ou conversa sem interação do cliente)
CREATE OR REPLACE FUNCTION public.auto_close_scan()
RETURNS TABLE(conv_id uuid, owner_id uuid, contact_ref uuid, action text, msg text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION public.auto_close_scan() TO service_role;

-- ── invoke + pg_cron a cada 5 min ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoke_auto_close_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    PERFORM net.http_post(
        url := v_url || '/functions/v1/auto-close-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auto-close-worker invoke error: %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.invoke_auto_close_worker() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('auto-close-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('auto-close-worker','*/5 * * * *',
    $CRON$SELECT public.invoke_auto_close_worker()$CRON$);
