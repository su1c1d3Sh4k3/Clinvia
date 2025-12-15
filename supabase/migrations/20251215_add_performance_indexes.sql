-- =====================================================
-- Performance Optimization: Add Database Indexes
-- =====================================================
-- These indexes improve query performance for common operations
-- Zero risk to application - only affects query speed
-- =====================================================

-- Messages by conversation (most used query)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON messages(conversation_id);

-- Messages ordered by date (for chat scrolling)
CREATE INDEX IF NOT EXISTS idx_messages_created_at 
ON messages(created_at DESC);

-- Conversations by status (for filtering tabs)
CREATE INDEX IF NOT EXISTS idx_conversations_status 
ON conversations(status);

-- Contacts by user_id (RLS performance)
CREATE INDEX IF NOT EXISTS idx_contacts_user_id 
ON contacts(user_id);

-- Messages by direction (for filtering inbound/outbound)
CREATE INDEX IF NOT EXISTS idx_messages_direction 
ON messages(direction);

-- Combined index for messages in a conversation ordered by date
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);
