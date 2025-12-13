-- Migration: Alterar assigned_agent_id para referenciar team_members.id
-- Isso permite que a atribuição funcione corretamente para admins e agentes

-- 1. Remover a FK antiga (se existir)
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_assigned_agent_id_fkey;

-- 2. Adicionar nova FK para team_members.id
ALTER TABLE public.conversations
ADD CONSTRAINT conversations_assigned_agent_id_fkey
FOREIGN KEY (assigned_agent_id) REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 3. Limpar valores antigos que não existem em team_members
UPDATE public.conversations
SET assigned_agent_id = NULL
WHERE assigned_agent_id IS NOT NULL
  AND assigned_agent_id NOT IN (SELECT id FROM public.team_members);

-- Comentário explicativo
COMMENT ON COLUMN public.conversations.assigned_agent_id IS 'ID do membro da equipe (team_members.id) atribuído a esta conversa';
