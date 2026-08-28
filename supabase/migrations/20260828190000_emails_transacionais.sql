-- E-mails transacionais da conta: colunas de apoio + relatorio de consumo.
--
-- 1) pending_signups ganha token de confirmacao de e-mail (o cadastro publico
--    NAO cria usuario no auth, entao nao da para usar o fluxo do Supabase).
-- 2) colunas de "ja avisei" para os e-mails que rodam em cron/health-check
--    nao repetirem a mesma mensagem todo ciclo.
-- 3) RPC get_account_usage_report: numeros do relatorio do dia 1o.

-- ---------------------------------------------------------------- 1) cadastro

ALTER TABLE public.pending_signups
    ADD COLUMN IF NOT EXISTS confirm_token      TEXT,
    ADD COLUMN IF NOT EXISTS confirm_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirm_sent_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_signups_confirm_token
    ON public.pending_signups (confirm_token) WHERE confirm_token IS NOT NULL;

-- ------------------------------------------------------- 2) anti-repeticao

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS deletion_warning_sent_at TIMESTAMPTZ;

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS disconnect_email_sent_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restriction_email_sent_at TIMESTAMPTZ;

-- ------------------------------------------------ 3) relatorio de consumo

-- Espelha a matematica ja usada no dashboard (aba Minha Conta):
--   IA    = token_usage_log (custo ja gravado em BRL por linha)
--   Meta  = template_sends x preco da categoria do template x cotacao do dolar
-- Disparo de campanha conta a entrega efetiva (sent_at preenchido e nao rejeitada).
CREATE OR REPLACE FUNCTION public.get_account_usage_report(
    p_user_id UUID,
    p_start   TIMESTAMPTZ,
    p_end     TIMESTAMPTZ
)
RETURNS TABLE (
    tokens_entrada       BIGINT,
    tokens_saida         BIGINT,
    tokens_total         BIGINT,
    custo_ia_brl         NUMERIC,
    disparos_campanhas   BIGINT,
    disparos_automaticos BIGINT,
    disparos_total       BIGINT,
    templates_meta       BIGINT,
    custo_meta_brl       NUMERIC,
    custo_total_brl      NUMERIC,
    conversas_atendidas  BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH ia AS (
        SELECT COALESCE(SUM(prompt_tokens), 0)::bigint     AS entrada,
               COALESCE(SUM(completion_tokens), 0)::bigint  AS saida,
               COALESCE(SUM(total_tokens), 0)::bigint       AS total,
               COALESCE(SUM(cost_brl), 0)::numeric          AS custo
        FROM token_usage_log
        WHERE owner_id = p_user_id AND created_at >= p_start AND created_at < p_end
    ),
    tpl AS (
        SELECT COUNT(*)::bigint AS qtd,
               COALESCE(SUM(public.meta_template_price_usd(ts.user_id, ts.template_name)), 0) AS usd,
               COUNT(*) FILTER (WHERE ts.sent_via = 'automation')::bigint AS automaticos
        FROM template_sends ts
        WHERE ts.user_id = p_user_id AND ts.created_at >= p_start AND ts.created_at < p_end
    ),
    camp AS (
        SELECT COUNT(*)::bigint AS qtd
        FROM campaign_contacts cc
        WHERE cc.user_id = p_user_id
          AND cc.sent_at >= p_start AND cc.sent_at < p_end
          AND cc.message_status IS DISTINCT FROM 'failed'
    ),
    conv AS (
        SELECT COUNT(*)::bigint AS qtd
        FROM conversations c
        WHERE c.user_id = p_user_id AND c.created_at >= p_start AND c.created_at < p_end
    )
    SELECT ia.entrada, ia.saida, ia.total, ROUND(ia.custo, 2),
           camp.qtd,
           tpl.automaticos,
           camp.qtd + tpl.automaticos,
           tpl.qtd,
           ROUND(tpl.usd * public.latest_usd_brl_rate(), 2),
           ROUND(ia.custo + tpl.usd * public.latest_usd_brl_rate(), 2),
           conv.qtd
    FROM ia, tpl, camp, conv;
$function$;

REVOKE ALL ON FUNCTION public.get_account_usage_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_usage_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

NOTIFY pgrst, 'reload schema';
