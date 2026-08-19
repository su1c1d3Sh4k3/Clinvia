-- User rule: atendimento atribuído a um ATENDENTE é exclusivo dele — nenhum
-- outro atendente pode sequer visualizar. Admin/supervisor veem tudo.
--
-- Antes: a policy permissiva conversations_all (user_id = get_owner_id())
-- deixava QUALQUER membro ver todas as conversas do owner (a policy antiga
-- "Team members can view conversations based on role" era inócua — permissivas
-- somam por OR). Só existia restrição por instância/fila (conversations_agent_scope).
--
-- Fix: policy RESTRITIVA de SELECT — se o chamador é agent, a conversa precisa
-- estar sem atribuição OU atribuída a ele. Não-agents (admin/supervisor/owner)
-- passam direto. Soma-se (AND) ao escopo instância/fila existente.
-- Service role não é afetado (bypass RLS). Espelha o padrão my_agent_scope_*.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.my_agent_tm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tm.id
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid() AND tm.role = 'agent'
    LIMIT 1;
$$;

DROP POLICY IF EXISTS conversations_agent_assignment ON public.conversations;
CREATE POLICY conversations_agent_assignment
ON public.conversations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    (SELECT my_agent_tm_id()) IS NULL          -- não é atendente: sem restrição
    OR assigned_agent_id IS NULL               -- sem atribuição: visível a todos
    OR assigned_agent_id = (SELECT my_agent_tm_id())  -- atribuída a ele
);
