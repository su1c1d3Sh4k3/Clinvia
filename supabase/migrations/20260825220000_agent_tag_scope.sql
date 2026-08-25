-- =============================================
-- USER RULE (2026-08-25): escopo de visibilidade por TAG para Atendentes,
-- espelhando o escopo de instâncias/filas (team_members, migr 20260817170000/180000):
--   * team_members.allowed_tag_ids (uuid[], NULL = todas; só role agent)
--   * Conversa visível se o CONTATO tem ao menos uma das tags selecionadas
--     — contato SEM tag nenhuma fica OCULTO (diferente do escopo de fila)
--   * E lógico com o escopo existente: instância E fila E tag
--   * Tags excluídas (ex.: campanha encerrada, CASCADE apaga a tag) são
--     ignoradas — se NENHUMA tag selecionada existir mais, o colaborador
--     volta a ver tudo (helper intersecta com tags existentes e NULLIF vazio)
--   * Grupos seguem sempre visíveis (bypass, padrão migr 20260821130000)
--   * Admin/supervisor sempre veem tudo
-- =============================================

SET lock_timeout = '5s';

ALTER TABLE public.team_members
    ADD COLUMN IF NOT EXISTS allowed_tag_ids UUID[] DEFAULT NULL;

-- ── Helper: tags do escopo do caller, já filtradas pelas que EXISTEM ──
-- NULL = sem restrição (não-agent, allowed_tag_ids NULL, ou todas as
-- selecionadas foram excluídas do banco).
CREATE OR REPLACE FUNCTION public.my_agent_scope_tags()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NULLIF(
        ARRAY(SELECT t.id FROM tags t WHERE t.id = ANY (tm.allowed_tag_ids)),
        '{}'::uuid[]
    )
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid()
      AND tm.role = 'agent'
      AND tm.allowed_tag_ids IS NOT NULL
    LIMIT 1;
$$;

-- ── Helper puro (SECURITY DEFINER p/ ler contact_tags sem RLS recursiva) ──
-- p_tags NULL = sem restrição → TRUE; contato sem tag do escopo → FALSE.
CREATE OR REPLACE FUNCTION public.contact_has_scope_tag(p_contact uuid, p_tags uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_tags IS NULL THEN TRUE
        WHEN p_contact IS NULL THEN FALSE
        ELSE EXISTS (
            SELECT 1 FROM contact_tags ct
            WHERE ct.contact_id = p_contact AND ct.tag_id = ANY (p_tags)
        )
    END;
$$;

-- ── conversations: RESTRICTIVE (AND com permissivas e demais restritivas) ──
-- Escopo avaliado 1x por query via (SELECT fn()) — initplan, não per-row;
-- usuários sem restrição curto-circuitam no IS NULL.
DROP POLICY IF EXISTS conversations_agent_tag_scope ON public.conversations;
CREATE POLICY conversations_agent_tag_scope ON public.conversations
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    (SELECT public.my_agent_scope_tags()) IS NULL
    OR group_id IS NOT NULL
    OR public.contact_has_scope_tag(contact_id, (SELECT public.my_agent_scope_tags()))
);

-- ── crm_client: card visível se o contato tem tag do escopo ──
DROP POLICY IF EXISTS crm_client_agent_tag_scope ON public.crm_client;
CREATE POLICY crm_client_agent_tag_scope ON public.crm_client
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    public.contact_has_scope_tag(contact_id, (SELECT public.my_agent_scope_tags()))
);

-- ── Dashboard CRM ao vivo: compute ganha p_scope_tags ──
-- DROP obrigatório (mudança de assinatura); chamadas 2-arg (cron snapshot) e
-- 4-arg seguem funcionando via DEFAULT NULL.
DROP FUNCTION IF EXISTS public.compute_crm_stage_counts(UUID, DATE, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION public.compute_crm_stage_counts(
    p_user_id UUID, p_date DATE,
    p_scope_instances UUID[] DEFAULT NULL, p_scope_queues UUID[] DEFAULT NULL,
    p_scope_tags UUID[] DEFAULT NULL
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
      AND (p_scope_tags IS NULL
           OR EXISTS (SELECT 1 FROM contact_tags ct
                      WHERE ct.contact_id = cc.contact_id AND ct.tag_id = ANY (p_scope_tags)))
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
    public.my_agent_scope_queues(),
    public.my_agent_scope_tags()
);
$$;
