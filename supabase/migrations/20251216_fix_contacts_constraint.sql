-- Fix: Alterar constraint de contatos para suportar multi-instância
-- Problema: constraint (user_id, number) impede múltiplos contatos por instância
-- Solução: mudar para (instance_id, number)

-- 1. Remover constraint antiga
ALTER TABLE contacts
DROP CONSTRAINT IF EXISTS contacts_user_id_number_unique;

-- 2. Primeiro, atualizar contatos existentes que não têm instance_id
-- Associar ao instance_id da primeira instância do user_id
UPDATE contacts c
SET instance_id = (
    SELECT i.id 
    FROM instances i 
    WHERE i.user_id = c.user_id 
    LIMIT 1
)
WHERE c.instance_id IS NULL;

-- 3. Criar nova constraint por instance_id + number
-- Usar índice parcial para contatos com instance_id definido
DROP INDEX IF EXISTS idx_contacts_unique_per_instance;
CREATE UNIQUE INDEX idx_contacts_unique_per_instance 
ON contacts (instance_id, number) 
WHERE instance_id IS NOT NULL;

-- 4. Também remover a constraint antiga se existir com outro nome
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'contacts_user_id_number_key'
    ) THEN
        ALTER TABLE contacts DROP CONSTRAINT contacts_user_id_number_key;
    END IF;
END $$;

-- Log
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Changed contacts unique constraint from (user_id, number) to (instance_id, number)';
END $$;
