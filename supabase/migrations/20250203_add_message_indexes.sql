-- =====================================================
-- Performance Optimization: Additional Database Indexes
-- =====================================================
-- Índices especializados para otimizar queries específicas
-- Melhora performance de buscas por evolution_id, user_id, e status
-- =====================================================

-- ✅ Índice para busca por evolution_id (usado em editar/deletar mensagens)
-- Permite busca rápida de mensagens pelo ID do provider (WhatsApp/Instagram)
CREATE INDEX IF NOT EXISTS idx_messages_evolution_id 
ON messages(evolution_id) 
WHERE evolution_id IS NOT NULL;

-- ✅ Índice para filtragem por user_id (usado em relatórios e analytics)
-- Permite buscar rapidamente todas as mensagens de um agente específico
CREATE INDEX IF NOT EXISTS idx_messages_user_id 
ON messages(user_id) 
WHERE user_id IS NOT NULL;

-- ✅ Índice para busca de mensagens por status
-- Útil para filtrar mensagens com erro, enviando, etc.
CREATE INDEX IF NOT EXISTS idx_messages_status 
ON messages(status)
WHERE status IS NOT NULL;

-- ✅ Índice composto para conversas por status + data de atualização
-- Otimiza listagem de conversas filtradas por status e ordenadas por data
CREATE INDEX IF NOT EXISTS idx_conversations_status_updated 
ON conversations(status, updated_at DESC);

-- ✅ Índice para busca de mensagens deletadas
-- Melhora performance de queries que filtram mensagens não deletadas
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted 
ON messages(conversation_id, created_at DESC)
WHERE is_deleted = false;

-- ✅ Índice para mensagens com mídia
-- Útil para relatórios de uso de storage e listagem de mídias
CREATE INDEX IF NOT EXISTS idx_messages_with_media 
ON messages(message_type, created_at DESC)
WHERE media_url IS NOT NULL;

-- ✅ Índice para conversas por agente
-- Permite busca rápida de todas as conversas atribuídas a um agente
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent 
ON conversations(assigned_agent_id, status)
WHERE assigned_agent_id IS NOT NULL;

-- Comentários para documentação
COMMENT ON INDEX idx_messages_evolution_id IS 
  'Otimiza busca de mensagens por evolution_id para operações de edição/exclusão via API externa';

COMMENT ON INDEX idx_messages_user_id IS 
  'Otimiza relatórios e analytics por agente/usuário';

COMMENT ON INDEX idx_messages_status IS 
  'Permite filtro rápido por status (sending, sent, error, etc)';

COMMENT ON INDEX idx_conversations_status_updated IS 
  'Otimiza listagem de conversas com filtro por status e ordenação por data';

COMMENT ON INDEX idx_messages_not_deleted IS 
  'Melhora performance de queries que excluem mensagens deletadas';

COMMENT ON INDEX idx_messages_with_media IS 
  'Útil para relatórios de uso de mídia e storage';

COMMENT ON INDEX idx_conversations_assigned_agent IS 
  'Otimiza busca de conversas por agente responsável';
