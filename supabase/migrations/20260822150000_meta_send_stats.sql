-- 4º card "Envios Meta" da aba Minha Conta (user request 2026-08-21):
-- consumo estimado com envio de templates Meta (template_sends é SÓ Meta por
-- decisão de produto). Preço por mensagem (BR) conforme categoria do template
-- em message_templates: MARKETING US$ 0.0625 (mesmo valor de CampaignWizard),
-- UTILITY US$ 0.008, AUTHENTICATION US$ 0.0315; template não encontrado =
-- MARKETING (estimativa conservadora). BRL via latest_usd_brl_rate()
-- (migration 20260822120000). Fuso: America/Sao_Paulo.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_my_meta_send_stats()
RETURNS TABLE (
    total_count BIGINT,
    total_cost_brl NUMERIC,
    month_count BIGINT,
    month_cost_brl NUMERIC,
    today_count BIGINT,
    today_cost_brl NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID := public.get_owner_id();
    v_rate NUMERIC := public.latest_usd_brl_rate();
    v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_month_start DATE := date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    IF v_owner IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH sends AS (
        SELECT
            (ts.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
            CASE upper(COALESCE((
                SELECT mt.category
                FROM message_templates mt
                WHERE mt.user_id = ts.user_id
                  AND mt.name = ts.template_name
                ORDER BY mt.updated_at DESC NULLS LAST
                LIMIT 1
            ), 'MARKETING'))
                WHEN 'UTILITY' THEN 0.008
                WHEN 'AUTHENTICATION' THEN 0.0315
                ELSE 0.0625
            END::numeric AS price_usd
        FROM template_sends ts
        WHERE ts.user_id = v_owner
    )
    SELECT
        COUNT(*)::bigint,
        (COALESCE(SUM(s.price_usd), 0) * v_rate)::numeric,
        (COUNT(*) FILTER (WHERE s.d >= v_month_start))::bigint,
        (COALESCE(SUM(s.price_usd) FILTER (WHERE s.d >= v_month_start), 0) * v_rate)::numeric,
        (COUNT(*) FILTER (WHERE s.d = v_today))::bigint,
        (COALESCE(SUM(s.price_usd) FILTER (WHERE s.d = v_today), 0) * v_rate)::numeric
    FROM sends s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_meta_send_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_meta_send_stats() TO authenticated;
