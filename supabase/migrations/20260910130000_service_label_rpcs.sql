-- Nome composto "Servico - Aplicacao" nas RPCs de relatorio.
-- Os snapshots de texto (sales.product_name, appointments.service_name, ...)
-- continuam guardando so a aplicacao; a composicao acontece na LEITURA, via FK.

create or replace function public.clinvia_service_label(
    p_service_client_id uuid,
    p_fallback text default null
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
    select coalesce(
        (
            select public.clinvia_full_service_name(sn.name, sc.name, cat.category_type)
            from services_client sc
            left join service_name sn on sn.id = sc.service_name_id
            left join services_category cat on cat.id = sc.category_id
            where sc.id = p_service_client_id
        ),
        nullif(btrim(p_fallback), '')
    );
$function$;


-- ============================

CREATE OR REPLACE FUNCTION public.get_crm_stage_deals(p_stage text, p_start timestamp with time zone, p_end timestamp with time zone, p_channel uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 300)
 RETURNS TABLE(deal_id uuid, contact_id uuid, contact_name text, contact_number text, stage_changed_at timestamp with time zone, deal_value numeric, services_count integer, services_label text, conversation_id uuid, ticket_id text, conversation_started_at timestamp with time zone, conversation_ended_at timestamp with time zone, conversation_status text, agent_name text, sender_names text, is_ai_handled boolean, message_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH me AS (
    SELECT public.get_owner_id() AS uid,
           public.my_agent_scope_instances() AS inst,
           public.my_agent_scope_queues() AS queues,
           public.my_agent_scope_tags() AS tags
),
scoped_convs AS (
    SELECT c.id, c.contact_id, c.status, c.created_at, c.resolved_at, c.updated_at,
           c.ticket_id, c.assigned_agent_id, c.is_ai_handled, c.messages_history,
           COALESCE(c.instance_id, c.instagram_instance_id,
                    '00000000-0000-0000-0000-000000000000'::uuid) AS channel_key
    FROM conversations c, me
    WHERE c.user_id = me.uid
      AND (me.inst IS NULL
           OR (c.instance_id IS NULL AND c.instagram_instance_id IS NULL)
           OR c.instance_id = ANY (me.inst)
           OR c.instagram_instance_id = ANY (me.inst))
      AND (me.queues IS NULL
           OR c.queue_id IS NULL
           OR c.queue_id = ANY (me.queues))
),
deals AS (
    SELECT cc.id, cc.contact_id, cc.channel_key, cc.value, cc.stage_changed_at
    FROM crm_client cc, me
    WHERE cc.user_id = me.uid
      AND cc.stage = p_stage
      AND cc.stage_changed_at >= p_start
      AND cc.stage_changed_at <= p_end
      AND (p_channel IS NULL OR cc.channel_key = p_channel)
      AND (me.inst IS NULL
           OR cc.channel_key = '00000000-0000-0000-0000-000000000000'::uuid
           OR cc.channel_key = ANY (me.inst))
      AND ((me.inst IS NULL AND me.queues IS NULL)
           OR EXISTS (SELECT 1 FROM scoped_convs sc WHERE sc.contact_id = cc.contact_id))
      AND (me.tags IS NULL
           OR EXISTS (SELECT 1 FROM contact_tags ct
                      WHERE ct.contact_id = cc.contact_id AND ct.tag_id = ANY (me.tags)))
    ORDER BY cc.stage_changed_at DESC
    LIMIT p_limit
),
ticket AS (
    -- conversa que estava em andamento quando o card mudou de etapa: a mais
    -- recente iniciada ANTES da mudanca; se nao houver, a mais proxima depois.
    SELECT DISTINCT ON (d.id)
           d.id AS deal_id, sc.id AS conversation_id, sc.ticket_id, sc.status,
           sc.created_at, sc.resolved_at, sc.updated_at, sc.assigned_agent_id,
           sc.is_ai_handled, sc.messages_history
    FROM deals d
    JOIN scoped_convs sc
      ON sc.contact_id = d.contact_id
     AND sc.channel_key = d.channel_key
    ORDER BY d.id,
             (sc.created_at <= d.stage_changed_at) DESC,
             abs(EXTRACT(EPOCH FROM (sc.created_at - d.stage_changed_at))) ASC
)
SELECT d.id AS deal_id,
       d.contact_id,
       COALESCE(NULLIF(ct.push_name, ''), ct.number, 'Sem nome') AS contact_name,
       ct.number AS contact_number,
       d.stage_changed_at,
       COALESCE(d.value, 0)::numeric AS deal_value,
       COALESCE(svc.qtd, 0)::int AS services_count,
       svc.label AS services_label,
       t.conversation_id,
       t.ticket_id,
       t.created_at AS conversation_started_at,
       CASE WHEN t.status = 'resolved' THEN COALESCE(t.resolved_at, t.updated_at) END
           AS conversation_ended_at,
       t.status AS conversation_status,
       tm.name AS agent_name,
       snd.names AS sender_names,
       COALESCE(t.is_ai_handled, false) AS is_ai_handled,
       (CASE WHEN jsonb_typeof(t.messages_history) = 'array'
             THEN jsonb_array_length(t.messages_history) ELSE 0 END
        + COALESCE((SELECT count(*) FROM messages m WHERE m.conversation_id = t.conversation_id), 0)
       )::int AS message_count
FROM deals d
LEFT JOIN contacts ct ON ct.id = d.contact_id
LEFT JOIN ticket t ON t.deal_id = d.id
LEFT JOIN team_members tm ON tm.id = t.assigned_agent_id
LEFT JOIN LATERAL (
    SELECT count(*)::int AS qtd,
           string_agg(public.clinvia_service_label(cs.service_client_id, cs.service_name), ', ') AS label
    FROM crm_client_services cs
    WHERE cs.crm_client_id = d.id
) svc ON true
-- quem de fato escreveu no ticket (a conversa nem sempre tem responsavel fixo):
-- assinaturas das mensagens vivas + das arquivadas em messages_history
LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT s, ', ') AS names
    FROM (
        SELECT NULLIF(h->>'sender_name', '') AS s
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(t.messages_history) = 'array'
                      THEN t.messages_history ELSE '[]'::jsonb END) h
        UNION
        SELECT NULLIF(m.sender_name, '')
        FROM messages m
        WHERE m.conversation_id = t.conversation_id
    ) x
    WHERE s IS NOT NULL
) snd ON true
ORDER BY d.stage_changed_at DESC;
$function$;


-- ============================

CREATE OR REPLACE FUNCTION public.get_ranking_servicos_orcados(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(json_agg(t ORDER BY t.itens DESC, t.valor DESC), '[]'::json)
    FROM (
        SELECT
            public.clinvia_service_label(i.service_client_id, i.service_name) AS name,
            COUNT(*) AS itens,
            COALESCE(SUM(i.unit_price), 0) AS valor,
            COUNT(*) FILTER (WHERE i.status = 'vendido') AS vendidos
        FROM orcamentos o
        JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE o.user_id = get_owner_id()
          AND (p_start IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_start)
          AND (p_end IS NULL OR (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_end)
        GROUP BY 1
        ORDER BY COUNT(*) DESC, SUM(i.unit_price) DESC
        LIMIT 10
    ) t;
$function$;


-- ============================

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
                SELECT public.clinvia_service_label(s2.service_client_id, s2.product_name)
                FROM sales s2
                WHERE s2.team_member_id = tm.id
                  AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY 1
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


-- ============================

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
                SELECT public.clinvia_service_label(s2.service_client_id, s2.product_name)
                FROM sales s2
                WHERE s2.user_id = v_user_id
                  AND s2.responsavel_id IS NOT DISTINCT FROM r.id
                  AND s2.sale_date BETWEEN v_start_date AND v_end_date
                GROUP BY 1
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


-- ============================

CREATE OR REPLACE FUNCTION public.get_sales_table(p_limit integer DEFAULT 300, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(json_agg(t ORDER BY t.sale_date DESC, t.created_at DESC), '[]'::json)
    FROM (
        SELECT
            s.id,
            s.sale_date,
            s.created_at,
            public.clinvia_service_label(s.service_client_id, s.product_name) AS product_name,
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


-- ============================

CREATE OR REPLACE FUNCTION public.get_satisfaction_dashboard(p_owner uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_cards JSONB;
    v_reviews JSONB;
    v_agents JSONB;
    v_templates JSONB;
BEGIN
    -- Guarda multi-tenant (service_role passa: auth.uid() nulo)
    IF auth.uid() IS NOT NULL AND get_owner_id() IS DISTINCT FROM p_owner THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    -- ---------- Cards gerais ----------
    WITH nps_entries AS (
        SELECT nps_nota_to_number(e->>'nota') AS nota
        FROM contacts ct, jsonb_array_elements(ct.nps) e
        WHERE ct.user_id = p_owner AND ct.nps IS NOT NULL
          AND (e->>'dataPesquisa')::timestamptz >= p_start
          AND (e->>'dataPesquisa')::timestamptz < p_end
    ), sentiment AS (
        SELECT AVG(sentiment_score) AS avg_sent
        FROM conversations
        WHERE user_id = p_owner AND group_id IS NULL
          AND sentiment_score IS NOT NULL
          AND created_at >= p_start AND created_at < p_end
    )
    SELECT jsonb_build_object(
        'avg_sentiment', ROUND((SELECT avg_sent FROM sentiment)::numeric, 1),
        'avg_nps', ROUND(AVG(nota)::numeric, 1),
        'nps_count', COUNT(*)
    ) INTO v_cards
    FROM nps_entries WHERE nota IS NOT NULL;

    -- ---------- Últimas 10 avaliações NPS ----------
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'data' DESC), '[]'::jsonb) INTO v_reviews
    FROM (
        SELECT jsonb_build_object(
            'contact_name', ct.push_name,
            'phone', split_part(ct.number, '@', 1),
            'data', (e->>'dataPesquisa')::timestamptz,
            'nota', nps_nota_to_number(e->>'nota'),
            'feedback', e->>'feedback',
            'attended_by', CASE
                WHEN c.id IS NULL THEN NULL
                WHEN c.assigned_agent_id IS NOT NULL THEN tm.name
                WHEN c.is_ai_handled THEN 'IA'
            END,
            'is_ai', (c.assigned_agent_id IS NULL AND c.is_ai_handled),
            'duration_seconds', EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)),
            'sentiment', c.sentiment_score,
            'professional', ap.professional,
            'application', ap.application
        ) AS r
        FROM contacts ct
        CROSS JOIN jsonb_array_elements(ct.nps) e
        LEFT JOIN conversations c ON c.id = NULLIF(e->>'conversation_id', '')::uuid
        LEFT JOIN team_members tm ON tm.id = c.assigned_agent_id AND tm.user_id = p_owner
        LEFT JOIN LATERAL (
            SELECT string_agg(DISTINCT pr.name, ', ') AS professional,
                   string_agg(DISTINCT public.clinvia_service_label(a.service_id, a.service_name), ', ') AS application
            FROM appointment_confirmation_sessions s
            CROSS JOIN unnest(s.appointment_ids) aid
            JOIN appointments a ON a.id = aid
            LEFT JOIN professionals pr ON pr.id = a.professional_id
            WHERE s.conversation_id = c.id AND s.flow_type = 'feedback_24h'
        ) ap ON true
        WHERE ct.user_id = p_owner AND ct.nps IS NOT NULL
          AND (e->>'dataPesquisa')::timestamptz >= p_start
          AND (e->>'dataPesquisa')::timestamptz < p_end
        ORDER BY (e->>'dataPesquisa')::timestamptz DESC
        LIMIT 10
    ) sub;

    -- ---------- Métricas por atendente (+ IA) ----------
    WITH msg AS (
        SELECT m.conversation_id, m.direction, m.created_at, m.is_ai_response,
               lag(m.direction) OVER w AS prev_dir,
               lag(m.created_at) OVER w AS prev_at
        FROM messages m
        JOIN conversations mc ON mc.id = m.conversation_id
        WHERE m.user_id = p_owner AND mc.group_id IS NULL
          AND m.created_at >= p_start AND m.created_at < p_end
        WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.created_at)
    ), gaps AS (
        SELECT CASE
                   WHEN g.is_ai_response THEN 'ia'
                   ELSE c.assigned_agent_id::text
               END AS who,
               EXTRACT(EPOCH FROM (g.created_at - g.prev_at)) AS gap_s
        FROM msg g
        JOIN conversations c ON c.id = g.conversation_id
        WHERE g.direction = 'outbound' AND g.prev_dir = 'inbound'
    ), gap_agg AS (
        SELECT who, AVG(gap_s) AS avg_gap FROM gaps WHERE who IS NOT NULL GROUP BY who
    ), conv AS (
        SELECT c.id, c.sentiment_score,
               EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) AS dur_s,
               CASE
                   WHEN c.assigned_agent_id IS NOT NULL THEN c.assigned_agent_id::text
                   WHEN c.is_ai_handled THEN 'ia'
               END AS who
        FROM conversations c
        WHERE c.user_id = p_owner AND c.group_id IS NULL
          AND c.created_at >= p_start AND c.created_at < p_end
    ), conv_agg AS (
        SELECT who,
               COUNT(*) AS n_convs,
               SUM(dur_s) AS total_dur,
               AVG(sentiment_score) AS avg_sent
        FROM conv WHERE who IS NOT NULL GROUP BY who
    ), attendants AS (
        SELECT tm.id::text AS who, tm.name, false AS is_ai
        FROM team_members tm WHERE tm.user_id = p_owner
        UNION ALL
        SELECT 'ia', 'IA', true
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.who,
        'name', a.name,
        'is_ai', a.is_ai,
        'avg_response_seconds', ROUND(g.avg_gap::numeric, 0),
        'total_attendance_seconds', ROUND(COALESCE(ca.total_dur, 0)::numeric, 0),
        'avg_sentiment', ROUND(ca.avg_sent::numeric, 1),
        'attendance_count', COALESCE(ca.n_convs, 0)
    ) ORDER BY a.is_ai DESC, a.name), '[]'::jsonb) INTO v_agents
    FROM attendants a
    LEFT JOIN gap_agg g ON g.who = a.who
    LEFT JOIN conv_agg ca ON ca.who = a.who;

    -- ---------- Tabela de templates (todos os cadastrados, Meta) ----------
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'template_status', t.status,
        'last_sent_at', ls.created_at,
        'sent_via', ls.sent_via,
        'sent_by', COALESCE(tm.name, CASE ls.sent_via
            WHEN 'automation' THEN 'Sistema'
            WHEN 'campaign' THEN 'Campanha'
        END),
        'send_status', ls.status,
        'responded', (resp.created_at IS NOT NULL),
        'response_body', resp.body
    ) ORDER BY t.name), '[]'::jsonb) INTO v_templates
    FROM message_templates t
    LEFT JOIN LATERAL (
        SELECT s.* FROM template_sends s
        WHERE s.user_id = p_owner AND s.template_name = t.name
          AND s.created_at >= p_start AND s.created_at < p_end
        ORDER BY s.created_at DESC LIMIT 1
    ) ls ON true
    LEFT JOIN team_members tm ON tm.auth_user_id = ls.sent_by AND tm.user_id = p_owner
    LEFT JOIN LATERAL (
        SELECT m.body, m.created_at FROM messages m
        WHERE ls.conversation_id IS NOT NULL
          AND m.conversation_id = ls.conversation_id
          AND m.direction = 'inbound'
          AND m.created_at > ls.created_at
        ORDER BY m.created_at ASC LIMIT 1
    ) resp ON true
    WHERE t.user_id = p_owner;

    RETURN jsonb_build_object(
        'cards', COALESCE(v_cards, '{}'::jsonb),
        'last_reviews', v_reviews,
        'agents', v_agents,
        'templates', v_templates
    );
END;
$function$;


-- ============================

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
        'name', public.clinvia_service_label(s.service_client_id, s.product_name),
        'type', MAX(s.category),
        'total_revenue', SUM(s.total_amount),
        'quantity_sold', SUM(s.quantity)
    ) INTO v_result
    FROM sales s
    WHERE s.user_id = v_user_id
      AND s.sale_date BETWEEN v_start_date AND v_end_date
    GROUP BY public.clinvia_service_label(s.service_client_id, s.product_name)
    ORDER BY SUM(s.total_amount) DESC
    LIMIT 1;

    RETURN COALESCE(v_result, '{}'::JSON);
END;
$function$;
