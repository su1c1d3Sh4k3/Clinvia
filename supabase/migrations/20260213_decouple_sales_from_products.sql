-- Migration to decouple sales from products/services
-- Allows deleting products without breaking sales history

-- 1. Add product_name column to sales table
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 2. Populate product_name for existing sales
UPDATE sales
SET product_name = ps.name
FROM products_services ps
WHERE sales.product_service_id = ps.id;

-- 3. Make product_service_id nullable
ALTER TABLE sales
ALTER COLUMN product_service_id DROP NOT NULL;

-- 4. Update Foreign Key to ON DELETE SET NULL
ALTER TABLE sales
DROP CONSTRAINT IF EXISTS sales_product_service_id_fkey;

ALTER TABLE sales
ADD CONSTRAINT sales_product_service_id_fkey
FOREIGN KEY (product_service_id)
REFERENCES products_services(id)
ON DELETE SET NULL;

-- 5. Update RPCs to use product_name instead of joining (or fallback)
-- Updating get_top_product_service to group by sales.product_name instead of id
CREATE OR REPLACE FUNCTION get_top_product_service(p_month INTEGER, p_year INTEGER)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_result JSON;
BEGIN
    v_user_id := auth.uid();
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    SELECT json_build_object(
        'id', NULL, -- ID might be null if aggregated by name, or ambiguous
        'name', s.product_name,
        'type', MAX(s.category), -- Use the category stored in sales
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
$$;

-- Updating get_sales_by_agent to group by local name
CREATE OR REPLACE FUNCTION get_sales_by_agent(p_month INTEGER DEFAULT NULL, p_year INTEGER DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
$$;

-- Updating get_sales_by_professional
CREATE OR REPLACE FUNCTION get_sales_by_professional(p_month INTEGER DEFAULT NULL, p_year INTEGER DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
            p.photo_url as photo,
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
        LEFT JOIN sales s ON s.professional_id = p.id 
            AND s.sale_date BETWEEN v_start_date AND v_end_date
        WHERE p.user_id = v_user_id
        GROUP BY p.id, p.name, p.photo_url
        HAVING SUM(s.total_amount) > 0
    ) as prof_data;
    
    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;
