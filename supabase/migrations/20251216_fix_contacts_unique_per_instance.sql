-- Fix: Garantir unicidade de contatos por instância
-- Isso previne duplicação de contatos e garante roteamento correto de mensagens

-- 1. Primeiro, verificar e limpar duplicatas existentes (manter o mais recente)
-- Esta query mostra duplicatas antes de deletar
-- SELECT number, instance_id, COUNT(*), array_agg(id ORDER BY created_at DESC)
-- FROM contacts
-- WHERE instance_id IS NOT NULL
-- GROUP BY number, instance_id
-- HAVING COUNT(*) > 1;

-- 2. Deletar duplicatas (mantém apenas o registro mais recente de cada combinação)
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY instance_id, number
               ORDER BY created_at DESC
           ) as rn
    FROM contacts
    WHERE instance_id IS NOT NULL
)
DELETE FROM contacts
WHERE id IN (
    SELECT id FROM ranked WHERE rn > 1
);

-- 3. Criar índice único para prevenir futuras duplicatas
-- Usar índice parcial (WHERE instance_id IS NOT NULL) para permitir contatos legados sem instance_id
DROP INDEX IF EXISTS idx_contacts_unique_per_instance;
CREATE UNIQUE INDEX idx_contacts_unique_per_instance 
ON contacts (instance_id, number) 
WHERE instance_id IS NOT NULL;

-- Log
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Unique constraint added to contacts (instance_id, number)';
END $$;
