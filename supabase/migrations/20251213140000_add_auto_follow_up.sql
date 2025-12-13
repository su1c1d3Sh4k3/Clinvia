-- =============================================
-- Auto Follow Up Feature - Database Changes
-- =============================================

-- Add new columns to conversation_follow_ups for auto sending
ALTER TABLE public.conversation_follow_ups
ADD COLUMN IF NOT EXISTS auto_send BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_template_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;

-- Add index for efficient querying of pending auto follow ups
CREATE INDEX IF NOT EXISTS idx_conversation_follow_ups_auto_send 
ON public.conversation_follow_ups(auto_send, next_send_at) 
WHERE auto_send = true AND completed = false;

-- Comment on columns
COMMENT ON COLUMN public.conversation_follow_ups.auto_send IS 'Whether automatic sending is enabled for this follow up';
COMMENT ON COLUMN public.conversation_follow_ups.next_send_at IS 'Timestamp when next follow up message should be sent';
COMMENT ON COLUMN public.conversation_follow_ups.current_template_index IS 'Current position in the template sequence (0-based)';
COMMENT ON COLUMN public.conversation_follow_ups.completed IS 'Whether all templates have been sent';
