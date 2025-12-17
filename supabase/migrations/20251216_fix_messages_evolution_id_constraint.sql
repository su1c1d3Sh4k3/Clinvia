-- Fix: Alterar constraint de evolution_id para suportar multi-instância
-- Problema: Mesma mensagem do WhatsApp aparece em 2 instâncias (outbound/inbound)
--          mas evolution_id é único globalmente, impedindo salvar nas 2.
-- Solução: Mudar constraint para (evolution_id, conversation_id)

-- 1. Remover constraint única antiga
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_evolution_id_key;

-- 2. Remover índice se existir
DROP INDEX IF EXISTS messages_evolution_id_key;

-- 3. Criar nova constraint única composta
-- Permite o mesmo evolution_id em conversas diferentes
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_evolution_per_conversation
ON messages (evolution_id, conversation_id)
WHERE evolution_id IS NOT NULL;

-- Log
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Changed messages unique constraint from (evolution_id) to (evolution_id, conversation_id)';
END $$;
