-- Nova tabela: internal_chats
CREATE TYPE internal_chat_type AS ENUM ('direct', 'group');

CREATE TABLE public.internal_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type internal_chat_type NOT NULL DEFAULT 'direct',
    name TEXT, -- Opcional, usado apenas para grupos
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- A conta mestre que hospeda o chat
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Nova tabela: internal_chat_participants
CREATE TYPE internal_participant_role AS ENUM ('admin', 'member');

CREATE TABLE public.internal_chat_participants (
    chat_id UUID REFERENCES public.internal_chats(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role internal_participant_role NOT NULL DEFAULT 'member',
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (chat_id, user_id)
);

-- Nova tabela: internal_messages
CREATE TABLE public.internal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.internal_chats(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.internal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- Politicas para internal_chats
CREATE POLICY "Participantes podem ver seus chats"
ON public.internal_chats
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = id AND p.user_id = auth.uid()
    )
    OR user_id = auth.uid() -- A conta dona também pode ver (caso seja o dono da empresa)
);

CREATE POLICY "Participantes podem atualizar chats de grupo"
ON public.internal_chats
FOR UPDATE
TO authenticated
USING (
    type = 'group' AND EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = id AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Qualquer membro autenticado pode criar chat na própria empresa"
ON public.internal_chats
FOR INSERT
TO authenticated
WITH CHECK (true); -- Controle mais fino pode ser feito na app layer ou via trigger de limits

-- Politicas para internal_chat_participants
CREATE POLICY "Usuários podem ver participantes de seus chats"
ON public.internal_chat_participants
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = internal_chat_participants.chat_id AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Usuários podem se adicionar a chats ou ser adicionados por outros participantes"
ON public.internal_chat_participants
FOR INSERT
TO authenticated
WITH CHECK (
    -- Permite inserção se for o criador inicial do chat, ou se já for participante e estiver add alguém
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = internal_chat_participants.chat_id AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Participantes podem atualizar seu last_read_at"
ON public.internal_chat_participants
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Politicas para internal_messages
CREATE POLICY "Participantes podem ver mensagens do chat"
ON public.internal_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = internal_messages.chat_id AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Participantes podem enviar mensagens"
ON public.internal_messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.internal_chat_participants p
        WHERE p.chat_id = internal_messages.chat_id AND p.user_id = auth.uid()
    )
);

-- Funções para facilitar Realtime updates (updated_at)
CREATE OR REPLACE FUNCTION update_internal_chats_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_internal_chats
    BEFORE UPDATE ON public.internal_chats
    FOR EACH ROW
    EXECUTE FUNCTION update_internal_chats_updated_at();

-- Trigger para atualizar o `updated_at` do chat ao enviar uma mensagem (para ordenação)
CREATE OR REPLACE FUNCTION bump_internal_chat_updated_at()
RETURNS trigger AS $$
BEGIN
    UPDATE public.internal_chats SET updated_at = now() WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bump_internal_chat
    AFTER INSERT ON public.internal_messages
    FOR EACH ROW
    EXECUTE FUNCTION bump_internal_chat_updated_at();
