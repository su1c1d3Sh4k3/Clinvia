-- =============================================
-- Adicionar campo 'edited' à tabela contacts
-- Quando true, o nome do contato NÃO será atualizado automaticamente
-- Data: 2025-12-17
-- =============================================

-- 1. Adicionar campo edited
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;

-- 2. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_contacts_edited ON contacts(edited);

-- 3. Atualizar contatos existentes: 
-- Se push_name NÃO é um número (tem letras), marcar como editado
-- Regex: se contém pelo menos uma letra, é um nome real
UPDATE contacts 
SET edited = true 
WHERE push_name IS NOT NULL 
  AND push_name ~ '[a-zA-Z]'
  AND is_group = false;

-- 4. Log
DO $$
DECLARE
    v_total INTEGER;
    v_edited INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM contacts WHERE is_group = false;
    SELECT COUNT(*) INTO v_edited FROM contacts WHERE is_group = false AND edited = true;
    
    RAISE NOTICE 'Migration completed: % of % individual contacts marked as edited', v_edited, v_total;
END $$;
