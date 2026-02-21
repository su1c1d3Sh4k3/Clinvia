-- Correção drástica de Isolamento Multi-Tenant (RLS)
-- Como a coluna 'user_id' armazena o dono da empresa e 'auth_user_id' o login de quem acessa,
-- nós abrimos o banco pra todos antes. Agora vamos restringir estritamente pela mesma empresa.

-- 1. TEAM MEMBERS
DROP POLICY IF EXISTS "Qualquer membro autenticado pode ver a equipe" ON public.team_members;

CREATE POLICY "Qualquer membro autenticado pode ver a equipe da mesma empresa"
ON public.team_members FOR SELECT
TO authenticated
USING (
   -- Caso 1: O logado é o Dono da empresa
   user_id = auth.uid() 
   OR 
   -- Caso 2: O logado é um funcionário desta mesma empresa
   user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
);

-- 2. AJUSTE EM INTERNAL CHATS
-- Garantir o isolamento na inserção / criação dos chats:
DROP POLICY IF EXISTS "Qualquer membro autenticado pode criar chat na própria empresa" ON public.internal_chats;

CREATE POLICY "Qualquer membro autenticado pode criar chat na própria empresa"
ON public.internal_chats FOR INSERT
TO authenticated
WITH CHECK (
    -- O chat deve ser criado no tenant (user_id) a qual o usuário pertence ou domina
    user_id = auth.uid() 
    OR 
    user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
);

-- Corrigir a inserção de PARTICIPANTES no chat (internal_chat_participants)
-- Anteriormente a política barrou a inserção no laço por não permitir auto-inserção de outro UUID pela mesma pessoa num batch
DROP POLICY IF EXISTS "Usuários podem se adicionar a chats ou ser adicionados por outros participantes" ON public.internal_chat_participants;

CREATE POLICY "Proprietários e Participantes podem manipular participantes"
ON public.internal_chat_participants FOR INSERT
TO authenticated
WITH CHECK (
    -- Permite inserção se a row for criada pelo dono da empresa
    EXISTS (
        SELECT 1 FROM public.internal_chats ic 
        WHERE ic.id = internal_chat_participants.chat_id 
        AND ic.user_id = auth.uid()
    )
    OR
    -- Ou se ela estiver sendo criada por um membro válido dessa empresa
    EXISTS (
        SELECT 1 FROM public.internal_chats ic 
        JOIN public.team_members tm ON tm.user_id = ic.user_id
        WHERE ic.id = internal_chat_participants.chat_id 
        AND tm.auth_user_id = auth.uid()
    )
);
