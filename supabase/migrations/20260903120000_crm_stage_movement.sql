-- Dashboard > CRM passa a medir MOVIMENTACAO no periodo em vez de foto do funil.
-- Conta as negociacoes cuja ultima mudanca de etapa (stage_changed_at) caiu na
-- janela escolhida, agrupadas pela etapa em que estao. Mesma regua que a secao
-- Resultados ja usava para as etapas terminais, agora valendo para a aba inteira.
-- Espelha os filtros de escopo de compute_crm_stage_counts.
CREATE OR REPLACE FUNCTION public.get_crm_stage_movement(
    p_start timestamptz,
    p_end timestamptz,
    p_channel uuid DEFAULT NULL
)
RETURNS TABLE(
    stage text,
    total integer,
    open_count integer,
    pending_count integer,
    resolved_count integer,
    value_sum numeric
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
    SELECT c.contact_id, c.status, c.created_at,
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
    SELECT cc.stage AS s, cc.contact_id, cc.channel_key, cc.value
    FROM crm_client cc, me
    WHERE cc.user_id = me.uid
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
),
latest_conv AS (
    SELECT DISTINCT ON (sc.contact_id, sc.channel_key)
           sc.contact_id, sc.channel_key, sc.status
    FROM scoped_convs sc
    ORDER BY sc.contact_id, sc.channel_key,
             (sc.status IN ('open', 'pending')) DESC,
             sc.created_at DESC
)
SELECT d.s AS stage,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE lc.status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE lc.status = 'pending')::int AS pending_count,
       COUNT(*) FILTER (WHERE lc.status IS NULL OR lc.status NOT IN ('open', 'pending'))::int AS resolved_count,
       COALESCE(SUM(d.value), 0)::numeric AS value_sum
FROM deals d
LEFT JOIN latest_conv lc
       ON lc.contact_id = d.contact_id
      AND lc.channel_key = d.channel_key
GROUP BY d.s;
$function$;

GRANT EXECUTE ON FUNCTION public.get_crm_stage_movement(timestamptz, timestamptz, uuid) TO authenticated;
