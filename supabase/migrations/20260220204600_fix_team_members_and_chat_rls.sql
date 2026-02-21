-- Adiciona a coluna profile_pic_url na tabela team_members
ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;

-- Atualizar RLS da tabela team_members para permitir leitura irrestrita aos autenticados
-- Assim qualquer membro pode visualizar a lista da própria equipe
DROP POLICY IF EXISTS "Users can view their own team record" ON public.team_members;
DROP POLICY IF EXISTS "Admins can manage all team members" ON public.team_members;
DROP POLICY IF EXISTS "Supervisors can view all team members" ON public.team_members;
DROP POLICY IF EXISTS "Supervisors can manage agents" ON public.team_members;

-- Leitura: Qualquer usuário autenticado (que faz parte da equipe ou é admin) pode ver todos
CREATE POLICY "Qualquer membro autenticado pode ver a equipe"
ON public.team_members FOR SELECT
TO authenticated
USING (true);

-- Gerenciamento restrito a Admins
CREATE POLICY "Apenas admins podem gerenciar membros"
ON public.team_members FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Gerenciamento de agents para Supervisors
CREATE POLICY "Supervisors can manage agents"
ON public.team_members FOR ALL
TO authenticated
USING (is_supervisor() AND role = 'agent')
WITH CHECK (is_supervisor() AND role = 'agent');

-- -- Ajustar RLS de internal_chats para suportar conversas entre qualquer membro
-- DROP POLICY IF EXISTS "Users can create chats" ON public.internal_chats;
-- DROP POLICY IF EXISTS "Users can join direct chats" ON public.internal_chat_participants;

-- CREATE POLICY "Users can create chats"
-- ON public.internal_chats FOR INSERT
-- TO authenticated
-- WITH CHECK (true);

-- CREATE POLICY "Users can add self and others to specific chats"
-- ON public.internal_chat_participants FOR INSERT
-- TO authenticated
-- WITH CHECK (true);
