-- =====================================================
-- Performance Optimization: Auto-update Conversation Timestamps
-- =====================================================
-- Elimina necessidade de UPDATE manual na Edge Function
-- Redução estimada: ~100-200ms por mensagem enviada
-- =====================================================

-- Função que atualiza automaticamente a conversa quando uma mensagem é criada
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    updated_at = NOW(),
    last_message_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que executa a função após INSERT de mensagem
DROP TRIGGER IF EXISTS trg_update_conversation_on_message ON messages;

CREATE TRIGGER trg_update_conversation_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_on_message();

-- Comentário para documentação
COMMENT ON FUNCTION update_conversation_on_message() IS 
  'Atualiza automaticamente updated_at e last_message_at da conversa quando uma mensagem é inserida. Parte da otimização de performance do sistema de mensagens.';

COMMENT ON TRIGGER trg_update_conversation_on_message ON messages IS
  'Trigger automático para manter timestamps de conversação atualizados';
