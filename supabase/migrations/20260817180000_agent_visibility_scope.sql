-- =============================================
-- USER RULE (2026-08-17): enforcement do escopo de visibilidade do Atendente
-- (team_members.allowed_instance_ids / assigned_queue_ids, NULL = todas):
--   * E logico: conversa visivel se instancia liberada E fila atribuida
--   * conversa sem fila (queue_id NULL) = visivel (se instancia ok)
--   * conversa sem instancia nenhuma = visivel
--   * admin/supervisor (e agent sem restricao) veem tudo
-- Mecanismo: policies RESTRICTIVE (AND com as permissivas por owner) em
-- conversations (inbox/monitoramento/queries diretas) e crm_client (kanban).
-- Dashboard CRM (contagem ao vivo) ganha o mesmo filtro via get_crm_stage_counts;
-- snapshots de dias passados seguem owner-wide (nao ha como escopar retroativo).
-- =============================================

-- ── Helpers: escopo do caller (NULL = sem restricao) ──
CREATE OR REPLACE FUNCTION public.my_agent_scope_instances()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tm.allowed_instance_ids
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid() AND tm.role = 'agent'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_agent_scope_queues()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tm.assigned_queue_ids
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid() AND tm.role = 'agent'
    LIMIT 1;
$$;

-- ── conversations: RESTRICTIVE SELECT (AND com policies permissivas) ──
-- Escopo avaliado uma vez por query via (SELECT fn()) — initplan, nao per-row.
DROP POLICY IF EXISTS conversations_agent_scope ON public.conversations;
CREATE POLICY conversations_agent_scope ON public.conversations
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    (
        (SELECT public.my_agent_scope_instances()) IS NULL
        OR (instance_id IS NULL AND instagram_instance_id IS NULL)
        OR instance_id = ANY ((SELECT public.my_agent_scope_instances())::uuid[])
        OR instagram_instance_id = ANY ((SELECT public.my_agent_scope_instances())::uuid[])
    )
    AND
    (
        (SELECT public.my_agent_scope_queues()) IS NULL
        OR queue_id IS NULL
        OR queue_id = ANY ((SELECT public.my_agent_scope_queues())::uuid[])
    )
);

-- ── crm_client: card visivel se o contato tem ALGUMA conversa dentro do escopo ──
-- Funcao pura (escopo vem por argumento — initplan na policy); SECURITY DEFINER
-- p/ ler conversations sem recursao de RLS.
CREATE OR REPLACE FUNCTION public.crm_contact_in_scope(
    p_contact uuid, p_owner uuid, p_inst uuid[], p_queues uuid[]
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_inst IS NULL AND p_queues IS NULL THEN TRUE
        WHEN p_contact IS NULL THEN TRUE
        ELSE EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.contact_id = p_contact
              AND c.user_id = p_owner
              AND (p_inst IS NULL
                   OR (c.instance_id IS NULL AND c.instagram_instance_id IS NULL)
                   OR c.instance_id = ANY (p_inst)
                   OR c.instagram_instance_id = ANY (p_inst))
              AND (p_queues IS NULL
                   OR c.queue_id IS NULL
                   OR c.queue_id = ANY (p_queues))
        )
    END;
$$;

DROP POLICY IF EXISTS crm_client_agent_scope ON public.crm_client;
CREATE POLICY crm_client_agent_scope ON public.crm_client
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    public.crm_contact_in_scope(
        contact_id, user_id,
        (SELECT public.my_agent_scope_instances()),
        (SELECT public.my_agent_scope_queues())
    )
);

-- ── Dashboard CRM ao vivo: compute ganha escopo opcional ──
-- DROP obrigatorio: adicionar params DEFAULT criaria overload ambiguo (pitfall
-- get_followup_pending_contacts).
DROP FUNCTION IF EXISTS public.compute_crm_stage_counts(UUID, DATE);

CREATE OR REPLACE FUNCTION public.compute_crm_stage_counts(
    p_user_id UUID, p_date DATE,
    p_scope_instances UUID[] DEFAULT NULL, p_scope_queues UUID[] DEFAULT NULL
)
RETURNS TABLE(stage TEXT, total INTEGER, open_count INTEGER, pending_count INTEGER, resolved_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH scoped_convs AS (
    SELECT c.contact_id, c.status, c.created_at
    FROM conversations c
    WHERE c.user_id = p_user_id
      AND (p_scope_instances IS NULL
           OR (c.instance_id IS NULL AND c.instagram_instance_id IS NULL)
           OR c.instance_id = ANY (p_scope_instances)
           OR c.instagram_instance_id = ANY (p_scope_instances))
      AND (p_scope_queues IS NULL
           OR c.queue_id IS NULL
           OR c.queue_id = ANY (p_scope_queues))
),
deals AS (
    SELECT cc.stage AS s, cc.contact_id
    FROM crm_client cc
    WHERE cc.user_id = p_user_id AND cc.is_active = TRUE
      AND ((p_scope_instances IS NULL AND p_scope_queues IS NULL)
           OR EXISTS (SELECT 1 FROM scoped_convs sc WHERE sc.contact_id = cc.contact_id))
),
latest_conv AS (
    SELECT DISTINCT ON (sc.contact_id) sc.contact_id, sc.status
    FROM scoped_convs sc
    ORDER BY sc.contact_id,
             (sc.status IN ('open', 'pending')) DESC,
             sc.created_at DESC
)
SELECT d.s AS stage,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE lc.status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE lc.status = 'pending')::int AS pending_count,
       COUNT(*) FILTER (WHERE lc.status IS NULL OR lc.status NOT IN ('open', 'pending'))::int AS resolved_count
FROM deals d
LEFT JOIN latest_conv lc ON lc.contact_id = d.contact_id
GROUP BY d.s;
$$;

-- Wrapper ao vivo: aplica o escopo do caller (agent restrito); cron de snapshot
-- segue chamando a forma 2-arg (owner-wide, defaults NULL).
CREATE OR REPLACE FUNCTION public.get_crm_stage_counts()
RETURNS TABLE(stage TEXT, total INTEGER, open_count INTEGER, pending_count INTEGER, resolved_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT * FROM public.compute_crm_stage_counts(
    public.get_owner_id(),
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    public.my_agent_scope_instances(),
    public.my_agent_scope_queues()
);
$$;
