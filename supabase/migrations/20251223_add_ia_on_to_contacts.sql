-- =============================================
-- Adicionar coluna ia_on à tabela contacts
-- TRUE = IA ativa para este contato
-- FALSE = IA desativada para este contato
-- Data: 2025-12-23
-- =============================================

-- 1. Adicionar coluna ia_on com default TRUE
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ia_on BOOLEAN DEFAULT true;

-- 2. Garantir que TODOS os contatos existentes tenham ia_on = TRUE
-- Isso é importante para contatos criados antes desta migration
UPDATE contacts SET ia_on = true WHERE ia_on IS NULL;

-- 3. Criar índice para performance em queries filtradas
CREATE INDEX IF NOT EXISTS idx_contacts_ia_on ON contacts(ia_on);

-- 4. Adicionar comentário explicativo
COMMENT ON COLUMN contacts.ia_on IS 'Indica se a IA está ativa para este contato. TRUE = IA ativa, FALSE = IA desativada';

-- 5. Log de verificação
DO $$
DECLARE
    v_total INTEGER;
    v_ia_on INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM contacts;
    SELECT COUNT(*) INTO v_ia_on FROM contacts WHERE ia_on = true;
    
    RAISE NOTICE 'Migration ia_on completed: % of % contacts have IA enabled', v_ia_on, v_total;
END $$;
