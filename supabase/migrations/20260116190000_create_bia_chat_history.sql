-- =============================================
-- Tabela para armazenar histórico de chat da Bia
-- =============================================

CREATE TABLE IF NOT EXISTS bia_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    page_slug TEXT,
    page_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca por usuário
CREATE INDEX IF NOT EXISTS idx_bia_chat_history_user 
ON bia_chat_history(auth_user_id, created_at DESC);

-- RLS: cada usuário só vê seu próprio histórico
ALTER TABLE bia_chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chat history" ON bia_chat_history;
CREATE POLICY "Users can view their own chat history"
ON bia_chat_history FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own chat messages" ON bia_chat_history;
CREATE POLICY "Users can insert their own chat messages"
ON bia_chat_history FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own chat history" ON bia_chat_history;
CREATE POLICY "Users can delete their own chat history"
ON bia_chat_history FOR DELETE
TO authenticated
USING (auth_user_id = auth.uid());
