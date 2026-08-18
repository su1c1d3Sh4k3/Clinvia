-- Notas de conversa (2026-08-18): notas internas anexadas à conversa, visíveis
-- só no front (nunca enviadas ao cliente). Reusa client_documents (category
-- 'notas' já aparece na sub-aba Notas do Histórico do cliente).
-- edited_from guarda o texto anterior quando a nota é editada (sem apagar).

ALTER TABLE public.client_documents
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS author_name TEXT,
    ADD COLUMN IF NOT EXISTS edited_from TEXT;

CREATE INDEX IF NOT EXISTS idx_client_documents_conversation
    ON public.client_documents(conversation_id)
    WHERE conversation_id IS NOT NULL;
