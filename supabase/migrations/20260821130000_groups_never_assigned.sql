-- USER RULE (2026-08-21, caso AGOSTO POWER/Dayana): conversa de GRUPO nunca é
-- atribuída a um atendente e fica SEMPRE visível a todos os usuários do tenant.
--
-- 1) Backfill: limpa atribuições existentes em grupos
-- 2) Trigger BEFORE INSERT/UPDATE: força assigned_agent_id NULL quando group_id
--    presente (cobre resolve-ticket, transferência, triggers CRM, service role)
-- 3) Policies restritivas de agent (atribuição exclusiva + escopo instância/fila)
--    ganham bypass para grupos — grupo visível a todos independente de escopo

SET lock_timeout = '5s';

-- 1) Backfill
UPDATE public.conversations
SET assigned_agent_id = NULL
WHERE group_id IS NOT NULL AND assigned_agent_id IS NOT NULL;

-- 2) Trigger: grupo nunca carrega atribuição
CREATE OR REPLACE FUNCTION public.groups_never_assigned()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.group_id IS NOT NULL THEN
        NEW.assigned_agent_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_never_assigned ON public.conversations;
CREATE TRIGGER trg_groups_never_assigned
BEFORE INSERT OR UPDATE OF assigned_agent_id, group_id ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.groups_never_assigned();

-- 3a) Atribuição exclusiva: grupos sempre passam
DROP POLICY IF EXISTS conversations_agent_assignment ON public.conversations;
CREATE POLICY conversations_agent_assignment
ON public.conversations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    group_id IS NOT NULL                       -- grupo: visível a todos
    OR (SELECT my_agent_tm_id()) IS NULL       -- não é atendente: sem restrição
    OR assigned_agent_id IS NULL               -- sem atribuição: visível a todos
    OR assigned_agent_id = (SELECT my_agent_tm_id())  -- atribuída a ele
);

-- 3b) Escopo instância/fila: grupos sempre passam
DROP POLICY IF EXISTS conversations_agent_scope ON public.conversations;
CREATE POLICY conversations_agent_scope ON public.conversations
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    group_id IS NOT NULL
    OR (
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
    )
);
