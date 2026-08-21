-- Aba "Minha Conta" do Dashboard (user request 2026-08-21):
-- RPCs tenant-aware (get_owner_id) para consumo de tokens em BRL (n8n + sistema
-- unificados via token_usage_log) e contadores de tickets por atendente com
-- período server-side (evita cap de 1000 linhas do PostgREST no período "total").
--
-- Conversão BRL: linhas com cost_brl > 0 (n8n) usam o valor gravado; demais
-- (sistema, só USD) convertem com a última exchange_rate do log (fallback 5.50,
-- mesmo espelho do api-token-usage). Fuso dos cards mês/dia: America/Sao_Paulo.
--
-- Tradeoff documentado: os cards agregam token_usage_log (necessário p/ BRL e
-- card diário), NÃO os acumuladores profiles.tokens_total/monthly — consumo
-- anterior ao início do log fica fora do Total.

SET lock_timeout = '5s';

-- Helper interna: última cotação USD-BRL usada no log (global), fallback 5.50
CREATE OR REPLACE FUNCTION public.latest_usd_brl_rate()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT exchange_rate FROM token_usage_log
         WHERE exchange_rate IS NOT NULL
         ORDER BY created_at DESC LIMIT 1),
        5.50
    );
$$;

REVOKE EXECUTE ON FUNCTION public.latest_usd_brl_rate FROM public, anon;
GRANT EXECUTE ON FUNCTION public.latest_usd_brl_rate TO authenticated, service_role;

-- 1) Cards: total / mês corrente / hoje (tokens + custo BRL)
CREATE OR REPLACE FUNCTION public.get_my_token_stats()
RETURNS TABLE (
    total_tokens BIGINT,
    total_cost_brl NUMERIC,
    month_tokens BIGINT,
    month_cost_brl NUMERIC,
    today_tokens BIGINT,
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
    SELECT
        COALESCE(SUM(t.total_tokens), 0)::bigint,
        COALESCE(SUM(CASE WHEN t.cost_brl > 0 THEN t.cost_brl ELSE t.cost_usd * v_rate END), 0)::numeric,
        COALESCE(SUM(t.total_tokens) FILTER (WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_month_start), 0)::bigint,
        COALESCE(SUM(CASE WHEN t.cost_brl > 0 THEN t.cost_brl ELSE t.cost_usd * v_rate END)
            FILTER (WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_month_start), 0)::numeric,
        COALESCE(SUM(t.total_tokens) FILTER (WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today), 0)::bigint,
        COALESCE(SUM(CASE WHEN t.cost_brl > 0 THEN t.cost_brl ELSE t.cost_usd * v_rate END)
            FILTER (WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today), 0)::numeric
    FROM token_usage_log t
    WHERE t.owner_id = v_owner;
END;
$$;

-- 2) Gráfico mensal (por ano)
CREATE OR REPLACE FUNCTION public.get_my_token_monthly(p_year TEXT)
RETURNS TABLE (
    year_month TEXT,
    total_tokens BIGINT,
    total_cost_brl NUMERIC
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
        to_char(t.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'),
        COALESCE(SUM(t.total_tokens), 0)::bigint,
        COALESCE(SUM(CASE WHEN t.cost_brl > 0 THEN t.cost_brl ELSE t.cost_usd * v_rate END), 0)::numeric
    FROM token_usage_log t
    WHERE t.owner_id = v_owner
      AND to_char(t.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY') = p_year
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- 3) Gráfico diário (últimos N dias)
CREATE OR REPLACE FUNCTION public.get_my_token_daily(p_days INT)
RETURNS TABLE (
    usage_date DATE,
    total_tokens BIGINT,
    total_cost_brl NUMERIC
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
        (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
        COALESCE(SUM(t.total_tokens), 0)::bigint,
        COALESCE(SUM(CASE WHEN t.cost_brl > 0 THEN t.cost_brl ELSE t.cost_usd * v_rate END), 0)::numeric
    FROM token_usage_log t
    WHERE t.owner_id = v_owner
      AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_start
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- 4) Anos com dados (Select do gráfico mensal)
CREATE OR REPLACE FUNCTION public.get_my_token_years()
RETURNS TABLE (usage_year TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID := public.get_owner_id();
BEGIN
    IF v_owner IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT DISTINCT to_char(t.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY')
    FROM token_usage_log t
    WHERE t.owner_id = v_owner
    ORDER BY 1 DESC;
END;
$$;

-- 5) Contadores por atendente no período (espelha useMonitorConversations:
--    abertos/pendentes por created_at, resolvidos por resolved_at) — server-side
--    p/ o período "total" não sofrer o cap de linhas do PostgREST
CREATE OR REPLACE FUNCTION public.get_agent_ticket_counts(
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
)
RETURNS TABLE (
    team_member_id UUID,
    open_count BIGINT,
    pending_count BIGINT,
    resolved_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID := public.get_owner_id();
BEGIN
    IF v_owner IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.agent_id,
        COALESCE(SUM(s.o), 0)::bigint,
        COALESCE(SUM(s.p), 0)::bigint,
        COALESCE(SUM(s.r), 0)::bigint
    FROM (
        SELECT
            c.assigned_agent_id AS agent_id,
            CASE WHEN c.status = 'open' THEN 1 ELSE 0 END AS o,
            CASE WHEN c.status <> 'open' THEN 1 ELSE 0 END AS p,
            0 AS r
        FROM conversations c
        WHERE c.user_id = v_owner
          AND c.status IN ('open', 'pending')
          AND c.created_at >= p_start AND c.created_at <= p_end
        UNION ALL
        SELECT c.assigned_agent_id, 0, 0, 1
        FROM conversations c
        WHERE c.user_id = v_owner
          AND c.status = 'resolved'
          AND c.resolved_at >= p_start AND c.resolved_at <= p_end
    ) s
    WHERE s.agent_id IS NOT NULL
    GROUP BY s.agent_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_token_stats() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_token_monthly(TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_token_daily(INT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_token_years() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_agent_ticket_counts(TIMESTAMPTZ, TIMESTAMPTZ) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_my_token_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_token_monthly(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_token_daily(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_token_years() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_ticket_counts(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
