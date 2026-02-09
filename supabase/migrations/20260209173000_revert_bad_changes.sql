-- Revert: Remover coluna sender_agent_id e trigger associado (Rollback total)
-- Objetivo: Restaurar estado anterior do banco de dados e remover lógica quebrada.

-- 1. Remover Trigger e Função
DROP TRIGGER IF EXISTS on_outbound_message_status ON public.messages;
DROP FUNCTION IF EXISTS public.handle_outbound_message_status();

-- 2. Remover coluna
ALTER TABLE public.messages
DROP COLUMN IF EXISTS sender_agent_id;
