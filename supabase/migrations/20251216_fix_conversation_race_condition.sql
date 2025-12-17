-- Fix: Prevenir race condition na criação de conversas
-- Problema: Duas mensagens chegando simultaneamente criam conversas duplicadas
-- Solução: Constraint de unicidade para conversas ativas (pending/open)

-- 1. Primeiro, deletar conversas duplicadas (manter a mais antiga)
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY contact_id, instance_id
               ORDER BY created_at ASC
           ) as rn
    FROM conversations
    WHERE status IN ('pending', 'open')
      AND contact_id IS NOT NULL
)
DELETE FROM conversations
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Criar índice único parcial para conversas ativas
-- Isso permite apenas UMA conversa pending/open por contact_id + instance_id
DROP INDEX IF EXISTS idx_conversations_unique_active;
CREATE UNIQUE INDEX idx_conversations_unique_active 
ON conversations (contact_id, instance_id) 
WHERE status IN ('pending', 'open') AND contact_id IS NOT NULL;

-- 3. Fazer o mesmo para grupos
DROP INDEX IF EXISTS idx_conversations_unique_active_group;
CREATE UNIQUE INDEX idx_conversations_unique_active_group 
ON conversations (group_id, instance_id) 
WHERE status IN ('pending', 'open') AND group_id IS NOT NULL;

-- Log
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Added unique constraints to prevent duplicate active conversations';
END $$;
