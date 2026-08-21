-- USER RULE (2026-08-21): "Restringir Grupo" — grupo é visível a todos por
-- padrão, mas admin/supervisor podem desmarcar membros que então deixam de ver
-- o grupo. Supervisor restringe só atendentes; admin restringe atendentes e
-- supervisores (gate no frontend, padrão do projeto). Dono/admin nunca é
-- restringido (blindagem no helper).
--
-- Complementa 20260821130000 (grupos nunca atribuídos): o bypass "grupo visível
-- a todos" das policies restritivas continua; esta policy nova (AND) esconde o
-- grupo APENAS de quem está em groups.hidden_from_team_member_ids.

SET lock_timeout = '5s';

ALTER TABLE public.groups
    ADD COLUMN IF NOT EXISTS hidden_from_team_member_ids uuid[] NOT NULL DEFAULT '{}';

-- team_member id do chamador SE ele for restringível (agent/supervisor).
-- Dono (auth_user_id = user_id) e admins nunca são restringidos.
CREATE OR REPLACE FUNCTION public.my_restrictable_tm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tm.id
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid()
      AND tm.role IN ('agent', 'supervisor')
      AND tm.auth_user_id IS DISTINCT FROM tm.user_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_group_hidden_for_me(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM groups g
        WHERE g.id = p_group_id
          AND (SELECT my_restrictable_tm_id()) = ANY (g.hidden_from_team_member_ids)
    );
$$;

DROP POLICY IF EXISTS conversations_group_hidden ON public.conversations;
CREATE POLICY conversations_group_hidden
ON public.conversations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    group_id IS NULL
    OR NOT public.is_group_hidden_for_me(group_id)
);
