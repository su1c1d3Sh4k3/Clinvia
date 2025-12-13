-- Adicionar campo sentiment_score à tabela conversations
-- Este campo armazena a nota de satisfação do cliente (0-10) gerada pela IA

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,1) DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.conversations.sentiment_score IS 'Score de satisfação do cliente (0-10) gerado pela IA no fechamento do ticket';

-- Criar índice para queries de relatórios
CREATE INDEX IF NOT EXISTS idx_conversations_sentiment_score ON public.conversations(sentiment_score);
