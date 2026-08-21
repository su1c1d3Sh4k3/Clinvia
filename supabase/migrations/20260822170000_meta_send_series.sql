-- Relatório do Consumo (Minha Conta): séries mensal/diária dos envios Meta
-- para as barras/linhas de custo Meta nos gráficos (par das RPCs de tokens
-- get_my_token_monthly/get_my_token_daily). Mesma precificação estimada da
-- get_my_meta_send_stats (migration 20260822150000): categoria do template em
-- message_templates — MARKETING US$ 0.0625 / UTILITY US$ 0.008 /
-- AUTHENTICATION US$ 0.0315, não encontrado = MARKETING — × latest_usd_brl_rate().

SET lock_timeout = '5s';

-- Helper interna: preço USD por envio, por categoria do template do tenant
CREATE OR REPLACE FUNCTION public.meta_template_price_usd(p_user UUID, p_template_name TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE upper(COALESCE((
        SELECT mt.category
        FROM message_templates mt
        WHERE mt.user_id = p_user
          AND mt.name = p_template_name
        ORDER BY mt.updated_at DESC NULLS LAST
        LIMIT 1
    ), 'MARKETING'))
        WHEN 'UTILITY' THEN 0.008
        WHEN 'AUTHENTICATION' THEN 0.0315
        ELSE 0.0625
    END::numeric;
$$;

REVOKE EXECUTE ON FUNCTION public.meta_template_price_usd(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.meta_template_price_usd(UUID, TEXT) TO authenticated, service_role;

-- 1) Série mensal (por ano) — custo Meta em BRL + nº de mensagens
CREATE OR REPLACE FUNCTION public.get_my_meta_send_monthly(p_year TEXT)
RETURNS TABLE (
    year_month TEXT,
    send_count BIGINT,
    cost_brl NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID := public.get_owner_id();
    v_rate NUMERIC := public.latest_usd_brl_rate();
BEGIN
    IF v_owner IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        to_char(ts.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'),
        COUNT(*)::bigint,
        (COALESCE(SUM(public.meta_template_price_usd(ts.user_id, ts.template_name)), 0) * v_rate)::numeric
    FROM template_sends ts
    WHERE ts.user_id = v_owner
      AND to_char(ts.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY') = p_year
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- 2) Série diária (últimos N dias)
CREATE OR REPLACE FUNCTION public.get_my_meta_send_daily(p_days INT)
RETURNS TABLE (
    usage_date DATE,
    send_count BIGINT,
    cost_brl NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID := public.get_owner_id();
    v_rate NUMERIC := public.latest_usd_brl_rate();
    v_start DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - GREATEST(COALESCE(p_days, 7) - 1, 0);
BEGIN
    IF v_owner IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        (ts.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
        COUNT(*)::bigint,
        (COALESCE(SUM(public.meta_template_price_usd(ts.user_id, ts.template_name)), 0) * v_rate)::numeric
    FROM template_sends ts
    WHERE ts.user_id = v_owner
      AND (ts.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_start
    GROUP BY 1
    ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_meta_send_monthly(TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_meta_send_daily(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_meta_send_monthly(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_meta_send_daily(INT) TO authenticated;
