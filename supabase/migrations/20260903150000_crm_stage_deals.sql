-- Lista das negociacoes por tras de um card da aba CRM do Dashboard.
-- Mesmo recorte de get_crm_stage_movement (movimentacao no periodo + escopo do
-- usuario), mas devolvendo uma linha por negociacao com os dados do ticket:
-- quando comecou/terminou, quem atendeu, quantas mensagens e se havia negociacao
-- vinculada. O ticket e a conversa do mesmo contato na mesma conexao que estava
-- em andamento quando o card mudou de etapa.
DROP FUNCTION IF EXISTS public.get_crm_stage_deals(text, timestamptz, timestamptz, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_crm_stage_deals(
    p_stage text,
    p_start timestamptz,
    p_end timestamptz,
    p_channel uuid DEFAULT NULL,
    p_limit integer DEFAULT 300
)
RETURNS TABLE(
    deal_id uuid,
    contact_id uuid,
    contact_name text,
    contact_number text,
    stage_changed_at timestamptz,
    deal_value numeric,
    services_count integer,
    services_label text,
    conversation_id uuid,
    ticket_id text,
    conversation_started_at timestamptz,
    conversation_ended_at timestamptz,
    conversation_status text,
    agent_name text,
    sender_names text,
    is_ai_handled boolean,
    message_count integer
)
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
    SELECT count(*)::int AS qtd, string_agg(cs.service_name, ', ') AS label
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

GRANT EXECUTE ON FUNCTION public.get_crm_stage_deals(text, timestamptz, timestamptz, uuid, integer) TO authenticated;
