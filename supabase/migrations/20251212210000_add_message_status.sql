-- =============================================
-- Add message status column for read receipts
-- =============================================

-- Add status column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- Add constraint for valid status values
-- Values: 'sent', 'delivered', 'read'
-- Note: WhatsApp may also send numeric statuses (1, 2, 3, 4, 5)

-- Create index for performance on status queries
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);

-- Comment explaining status values
COMMENT ON COLUMN public.messages.status IS 'Message delivery status: sent, delivered, read (or numeric 1-5 from WhatsApp)';
