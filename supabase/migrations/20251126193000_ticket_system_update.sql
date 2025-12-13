-- Adicionar coluna status se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'status') THEN
        ALTER TABLE "conversations" ADD COLUMN "status" TEXT DEFAULT 'pendente';
    END IF;
END $$;

-- Atualizar dados existentes para ter consistência
UPDATE conversations SET status = 'pendente' WHERE status IS NULL AND assigned_agent_id IS NULL;
UPDATE conversations SET status = 'aberto' WHERE status IS NULL AND assigned_agent_id IS NOT NULL;

-- Função para limitar 20 tickets por contato
CREATE OR REPLACE FUNCTION delete_old_conversations()
RETURNS TRIGGER AS $$
BEGIN
  -- Verificar contagem para este contato
  IF (SELECT count(*) FROM conversations WHERE contact_id = NEW.contact_id) > 20 THEN
    DELETE FROM conversations
    WHERE id = (
      SELECT id FROM conversations
      WHERE contact_id = NEW.contact_id
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_limit_conversations ON conversations;
CREATE TRIGGER trigger_limit_conversations
AFTER INSERT ON conversations
FOR EACH ROW
EXECUTE FUNCTION delete_old_conversations();
