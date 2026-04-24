-- =====================================================
-- Attendance Report: new metric fields
-- =====================================================
-- Adds cache fields to support 5 new KPIs in AttendanceReport:
--   1. First response time (IA vs Human)
--   2. AI-handled conversations (is_ai_handled)
--   3. Conversations outside business hours
--   4. Abandonment rate (48h without customer message)
--   5. NPS / Sentiment (already exist — contacts.nps, conversations.sentiment_score)
-- =====================================================

-- ─── messages: distinguish AI-generated responses ─────────────────────────────

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_ai_response BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_is_ai_response
    ON public.messages(is_ai_response) WHERE is_ai_response = true;

COMMENT ON COLUMN public.messages.is_ai_response
    IS 'TRUE se a mensagem foi gerada pela IA (N8N) e enviada automaticamente ao cliente';

-- ─── conversations: metric cache columns ──────────────────────────────────────

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_response_by_ai BOOLEAN,
    ADD COLUMN IF NOT EXISTS first_response_duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS is_ai_handled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_outside_business_hours BOOLEAN,
    ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_first_response_at
    ON public.conversations(first_response_at);
CREATE INDEX IF NOT EXISTS idx_conversations_is_ai_handled
    ON public.conversations(is_ai_handled) WHERE is_ai_handled = true;
CREATE INDEX IF NOT EXISTS idx_conversations_outside_hours
    ON public.conversations(is_outside_business_hours) WHERE is_outside_business_hours = true;
CREATE INDEX IF NOT EXISTS idx_conversations_last_customer_msg
    ON public.conversations(last_customer_message_at);

COMMENT ON COLUMN public.conversations.first_response_at
    IS 'Timestamp da primeira resposta outbound (IA ou humano) na conversa';
COMMENT ON COLUMN public.conversations.first_response_by_ai
    IS 'TRUE se a primeira resposta foi gerada pela IA';
COMMENT ON COLUMN public.conversations.first_response_duration_seconds
    IS 'Segundos entre a última mensagem do cliente (ou criação da conversa) e a primeira resposta';
COMMENT ON COLUMN public.conversations.is_ai_handled
    IS 'TRUE se PELO MENOS UMA mensagem da IA foi enviada nesta conversa';
COMMENT ON COLUMN public.conversations.is_outside_business_hours
    IS 'TRUE se a conversa foi criada fora do horário de expediente (scheduling_settings)';
COMMENT ON COLUMN public.conversations.last_customer_message_at
    IS 'Timestamp da última mensagem inbound do cliente (usado para detectar abandono em 48h)';
