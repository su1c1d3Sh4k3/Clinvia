-- =============================================
-- FIX: Alterar UNIQUE constraint de contacts
-- Data: 2025-12-16
-- Problema: UNIQUE em 'number' sozinho impede multi-tenancy
-- Solução: UNIQUE em (user_id, number) para permitir mesmo número em tenants diferentes
-- =============================================

-- 1. Remover constraint UNIQUE existente (se existir)
DO $$
BEGIN
    -- Tentar remover possíveis constraints
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_number_key;
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_number_unique;
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_remote_jid_key;
    
    -- Remover índices únicos se existirem
    DROP INDEX IF EXISTS contacts_number_key;
    DROP INDEX IF EXISTS contacts_number_unique;
    DROP INDEX IF EXISTS idx_contacts_number;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Some constraints may not exist, continuing...';
END $$;

-- 2. Criar nova constraint UNIQUE composta
ALTER TABLE contacts
ADD CONSTRAINT contacts_user_id_number_unique UNIQUE (user_id, number);

-- 3. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id_number ON contacts(user_id, number);

-- 4. Verificar
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'contacts'::regclass;
