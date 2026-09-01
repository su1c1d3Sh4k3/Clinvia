-- Foto e cargo agora pertencem ao PROFISSIONAL (responsaveis); professionals e a SALA.
-- Reescreve as 3 funcoes que ainda liam professionals.photo_url/role e dropa as colunas.

CREATE OR REPLACE FUNCTION public.admin_get_professionals(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, role text, photo_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT p.role INTO v_caller_role
    FROM profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role != 'super-admin' THEN
        RAISE EXCEPTION 'Access denied: super-admin role required';
    END IF;

    RETURN QUERY
    SELECT pr.id, pr.name, r.role, r.photo_url
    FROM professionals pr
    LEFT JOIN responsaveis r ON r.id = pr.responsavel_id
    WHERE pr.user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_revenue_by_professional()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_owner_id UUID;
    v_result JSON;
BEGIN
    v_owner_id := get_owner_id();

    SELECT json_agg(professional_data ORDER BY revenue DESC)
    INTO v_result
    FROM (
        SELECT
            p.id,
            p.name,
            resp.photo_url as photo,
            COALESCE(SUM(r.amount), 0)::DECIMAL as revenue,
            COUNT(DISTINCT r.appointment_id)::INTEGER as appointments
        FROM professionals p
        LEFT JOIN responsaveis resp ON resp.id = p.responsavel_id
        LEFT JOIN revenues r ON r.professional_id = p.id AND r.status = 'paid'
        WHERE p.user_id = v_owner_id
        GROUP BY p.id, p.name, resp.photo_url
    ) as professional_data;
    RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$;

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
    v_user_id := auth.uid();

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
            p.id,
            p.name,
            resp.photo_url as photo,
            COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_revenue,
            COALESCE(SUM(s.quantity), 0)::INTEGER as quantity_sold,
            (
                SELECT s2.product_name
                FROM sales s2
                WHERE s2.professional_id = p.id
                AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY s2.product_name
                ORDER BY SUM(s2.total_amount) DESC
                LIMIT 1
            ) as top_product
        FROM professionals p
        LEFT JOIN responsaveis resp ON resp.id = p.responsavel_id
        LEFT JOIN sales s ON s.professional_id = p.id
            AND s.sale_date BETWEEN v_start_date AND v_end_date
        WHERE p.user_id = v_user_id
        GROUP BY p.id, p.name, resp.photo_url
        HAVING SUM(s.total_amount) > 0
    ) as prof_data;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$;

ALTER TABLE public.professionals DROP COLUMN IF EXISTS photo_url;
ALTER TABLE public.professionals DROP COLUMN IF EXISTS role;
