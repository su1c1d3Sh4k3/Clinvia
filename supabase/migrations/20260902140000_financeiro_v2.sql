-- =====================================================================
-- Financeiro v2: pagina /financial refeita (abas Orcamentos e Vendas)
-- 1) faturamento passa a ser por responsaveis (profissional humano)
-- 2) RPCs de vendas trocam auth.uid() por get_owner_id() (team-aware)
-- 3) RPCs novas de orcamentos (cards, grafico, tabela, rankings)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. sales.responsavel_id: backfill pela sala + trigger para novas vendas
-- ---------------------------------------------------------------------
UPDATE public.sales s
SET responsavel_id = p.responsavel_id
FROM public.professionals p
WHERE p.id = s.professional_id
  AND p.responsavel_id IS NOT NULL
  AND s.responsavel_id IS NULL;

CREATE OR REPLACE FUNCTION public.fill_sale_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.responsavel_id IS NULL AND NEW.professional_id IS NOT NULL THEN
        SELECT p.responsavel_id INTO NEW.responsavel_id
        FROM public.professionals p
        WHERE p.id = NEW.professional_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sales_fill_responsavel ON public.sales;
CREATE TRIGGER zz_sales_fill_responsavel
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.fill_sale_responsavel();

-- ---------------------------------------------------------------------
-- 2. RPCs de vendas: team-aware + faturamento por responsavel
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_product_service(p_month integer, p_year integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_user_id := get_owner_id();
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT json_build_object(
        'id', NULL,
        'name', s.product_name,
        'type', MAX(s.category),
        'total_revenue', SUM(s.total_amount),
        'quantity_sold', SUM(s.quantity)
    ) INTO v_result
    FROM sales s
    WHERE s.user_id = v_user_id
      AND s.sale_date BETWEEN v_start_date AND v_end_date
    GROUP BY s.product_name
    ORDER BY SUM(s.total_amount) DESC
    LIMIT 1;

    RETURN COALESCE(v_result, '{}'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_by_agent(p_month integer DEFAULT NULL::integer, p_year integer DEFAULT NULL::integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_user_id := get_owner_id();

    IF p_month IS NOT NULL AND p_year IS NOT NULL THEN
        v_start_date := make_date(p_year, p_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSE
        v_start_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, 1);
        v_end_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 12, 31);
    END IF;

    SELECT json_agg(agent_data ORDER BY total_revenue DESC)
    INTO v_result
    FROM (
        SELECT
            tm.id,
            tm.name,
            tm.avatar_url as photo,
            COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_revenue,
            COALESCE(SUM(s.quantity), 0)::INTEGER as quantity_sold,
            (
                SELECT s2.product_name
                FROM sales s2
                WHERE s2.team_member_id = tm.id
                  AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY s2.product_name
                ORDER BY SUM(s2.total_amount) DESC
                LIMIT 1
            ) as top_product
        FROM team_members tm
        LEFT JOIN sales s ON s.team_member_id = tm.id
            AND s.sale_date BETWEEN v_start_date AND v_end_date
        WHERE tm.user_id = v_user_id
        GROUP BY tm.id, tm.name, tm.avatar_url
        HAVING SUM(s.total_amount) > 0
    ) as agent_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$;

-- Faturamento por profissional agora e por responsaveis (humano), nao por sala.
-- Vendas sem responsavel caem no balde "Sem responsavel".
CREATE OR REPLACE FUNCTION public.get_sales_by_professional(p_month integer DEFAULT NULL::integer, p_year integer DEFAULT NULL::integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_user_id := get_owner_id();

    IF p_month IS NOT NULL AND p_year IS NOT NULL THEN
        v_start_date := make_date(p_year, p_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSE
        v_start_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, 1);
        v_end_date := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 12, 31);
    END IF;

    SELECT json_agg(prof_data ORDER BY total_revenue DESC)
    INTO v_result
    FROM (
        SELECT
            COALESCE(r.id::text, 'sem-responsavel') as id,
            COALESCE(r.name, 'Sem responsável') as name,
            r.photo_url as photo,
            COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_revenue,
            COALESCE(SUM(s.quantity), 0)::INTEGER as quantity_sold,
            (
                SELECT s2.product_name
                FROM sales s2
                WHERE s2.user_id = v_user_id
                  AND s2.responsavel_id IS NOT DISTINCT FROM r.id
                  AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY s2.product_name
                ORDER BY SUM(s2.total_amount) DESC
                LIMIT 1
            ) as top_product
        FROM sales s
        LEFT JOIN responsaveis r ON r.id = s.responsavel_id
        WHERE s.user_id = v_user_id
          AND s.sale_date BETWEEN v_start_date AND v_end_date
        GROUP BY r.id, r.name, r.photo_url
    ) as prof_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$;

-- Tabela completa de vendas da aba Vendas (mais recentes no topo).
CREATE OR REPLACE FUNCTION public.get_sales_table(p_limit integer DEFAULT 300, p_offset integer DEFAULT 0)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(json_agg(t ORDER BY t.sale_date DESC, t.created_at DESC), '[]'::json)
    FROM (
        SELECT
            s.id,
            s.sale_date,
            s.created_at,
            s.product_name,
            s.category,
            s.quantity,
            s.unit_price,
            s.total_amount,
            s.payment_type,
            s.installments,
            s.contact_id,
            c.push_name AS contact_name,
            r.name AS responsavel_name,
            p.name AS sala_name,
            tm.name AS atendente_name,
            s.appointment_id,
            s.orcamento_item_id,
            s.appointment_alert,
            s.scheduled,
            s.ia_scheduling,
            (SELECT COUNT(*) FROM sale_installments si WHERE si.sale_id = s.id) AS parcelas_total,
            (SELECT COUNT(*) FROM sale_installments si WHERE si.sale_id = s.id AND si.status = 'paid') AS parcelas_pagas
        FROM sales s
        LEFT JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN responsaveis r ON r.id = s.responsavel_id
        LEFT JOIN professionals p ON p.id = s.professional_id
        LEFT JOIN team_members tm ON tm.id = s.team_member_id
        WHERE s.user_id = get_owner_id()
        ORDER BY s.sale_date DESC, s.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) t;
$function$;

-- ---------------------------------------------------------------------
-- 3. RPCs de orcamentos
-- ---------------------------------------------------------------------

-- Cards: valores (R$) e quantidade de itens por desfecho.
-- Aprovado usa o valor FINAL vendido (sales.total_amount), nao o orcado.
CREATE OR REPLACE FUNCTION public.get_orcamento_cards(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH base AS (
        SELECT o.id AS orcamento_id, i.status, i.unit_price, i.sale_id
        FROM orcamentos o
        JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE o.user_id = get_owner_id()
          AND (p_start IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start)
          AND (p_end IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end)
    )
    SELECT json_build_object(
        'orcamentos', (SELECT COUNT(DISTINCT orcamento_id) FROM base),
        'total_valor', COALESCE((SELECT SUM(unit_price) FROM base), 0),
        'total_itens', (SELECT COUNT(*) FROM base),
        'aprovado_valor', COALESCE((
            SELECT SUM(s.total_amount)
            FROM base b JOIN sales s ON s.id = b.sale_id
            WHERE b.status = 'vendido' AND s.user_id = get_owner_id()
        ), 0),
        'aprovado_itens', (SELECT COUNT(*) FROM base WHERE status = 'vendido'),
        'rejeitado_valor', COALESCE((SELECT SUM(unit_price) FROM base WHERE status IN ('recusado', 'expirado')), 0),
        'rejeitado_itens', (SELECT COUNT(*) FROM base WHERE status IN ('recusado', 'expirado')),
        'pendente_valor', COALESCE((SELECT SUM(unit_price) FROM base WHERE status = 'pendente'), 0),
        'pendente_itens', (SELECT COUNT(*) FROM base WHERE status = 'pendente')
    );
$function$;

-- Grafico: 12 meses, QUANTIDADE de itens orcados por desfecho.
CREATE OR REPLACE FUNCTION public.get_orcamento_monthly_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH months AS (
        SELECT generate_series(
            date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - INTERVAL '11 months',
            date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date),
            INTERVAL '1 month'
        )::date AS m
    ),
    base AS (
        SELECT date_trunc('month', (o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS m, i.status
        FROM orcamentos o
        JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE o.user_id = get_owner_id()
          AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              >= (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - INTERVAL '11 months')::date
    )
    SELECT COALESCE(json_agg(t ORDER BY t.mes), '[]'::json)
    FROM (
        SELECT
            to_char(months.m, 'YYYY-MM') AS mes,
            COUNT(b.status) AS realizados,
            COUNT(*) FILTER (WHERE b.status = 'vendido') AS fechados,
            COUNT(*) FILTER (WHERE b.status IN ('recusado', 'expirado')) AS perdidos,
            COUNT(*) FILTER (WHERE b.status = 'pendente') AS pendentes
        FROM months
        LEFT JOIN base b ON b.m = months.m
        GROUP BY months.m
    ) t;
$function$;

-- Tabela: uma linha por orcamento, mais recente no topo.
CREATE OR REPLACE FUNCTION public.get_orcamentos_table(p_limit integer DEFAULT 300, p_offset integer DEFAULT 0)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(json_agg(t ORDER BY t.created_at DESC), '[]'::json)
    FROM (
        SELECT
            o.id,
            o.created_at,
            o.contact_id,
            o.indicacao,
            o.validade,
            o.notes,
            c.push_name AS contact_name,
            c.number AS contact_number,
            r.name AS responsavel_name,
            tm.name AS criado_por,
            COUNT(i.id) AS itens,
            COALESCE(SUM(i.unit_price), 0) AS valor_total,
            COUNT(*) FILTER (WHERE i.status = 'pendente') AS pendentes,
            COUNT(*) FILTER (WHERE i.status = 'vendido') AS vendidos,
            COUNT(*) FILTER (WHERE i.status = 'recusado') AS recusados,
            COUNT(*) FILTER (WHERE i.status = 'expirado') AS expirados,
            COALESCE((
                SELECT SUM(s.total_amount)
                FROM orcamento_itens i2 JOIN sales s ON s.id = i2.sale_id
                WHERE i2.orcamento_id = o.id
            ), 0) AS valor_vendido
        FROM orcamentos o
        LEFT JOIN contacts c ON c.id = o.contact_id
        LEFT JOIN responsaveis r ON r.id = o.responsavel_id
        LEFT JOIN team_members tm ON tm.id = o.created_by
        LEFT JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE o.user_id = get_owner_id()
        GROUP BY o.id, c.push_name, c.number, r.name, tm.name
        ORDER BY o.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) t;
$function$;

-- Orcamentos por profissional (responsavel). Lista todos os ativos, inclusive zerados.
CREATE OR REPLACE FUNCTION public.get_orcamentos_by_responsavel(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH orc AS (
        SELECT o.id, o.responsavel_id,
               COALESCE((SELECT SUM(i.unit_price) FROM orcamento_itens i WHERE i.orcamento_id = o.id), 0) AS valor,
               COALESCE((SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id), 0) AS itens
        FROM orcamentos o
        WHERE o.user_id = get_owner_id()
          AND (p_start IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start)
          AND (p_end IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end)
    )
    SELECT COALESCE(json_agg(t ORDER BY t.orcamentos DESC, t.name), '[]'::json)
    FROM (
        SELECT
            r.id::text AS id,
            r.name,
            r.role,
            r.photo_url,
            COUNT(orc.id) AS orcamentos,
            COALESCE(SUM(orc.itens), 0) AS itens,
            COALESCE(SUM(orc.valor), 0) AS valor
        FROM responsaveis r
        LEFT JOIN orc ON orc.responsavel_id = r.id
        WHERE r.user_id = get_owner_id() AND r.active
        GROUP BY r.id, r.name, r.role, r.photo_url
    ) t;
$function$;

-- Ranking dos servicos mais ORCADOS (top 10).
CREATE OR REPLACE FUNCTION public.get_ranking_servicos_orcados(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(json_agg(t ORDER BY t.itens DESC, t.valor DESC), '[]'::json)
    FROM (
        SELECT
            i.service_name AS name,
            COUNT(*) AS itens,
            COALESCE(SUM(i.unit_price), 0) AS valor,
            COUNT(*) FILTER (WHERE i.status = 'vendido') AS vendidos
        FROM orcamentos o
        JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE o.user_id = get_owner_id()
          AND (p_start IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start)
          AND (p_end IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end)
        GROUP BY i.service_name
        ORDER BY COUNT(*) DESC, SUM(i.unit_price) DESC
        LIMIT 10
    ) t;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sales_table(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orcamento_cards(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orcamento_monthly_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orcamentos_table(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orcamentos_by_responsavel(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_servicos_orcados(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
