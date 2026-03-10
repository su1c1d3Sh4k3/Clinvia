-- Migration: crm_deal_attachments
-- Tabela para armazenar anexos de negociações do CRM

CREATE TABLE IF NOT EXISTS crm_deal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_attachments_deal ON crm_deal_attachments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_user ON crm_deal_attachments(user_id);

ALTER TABLE crm_deal_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own deal attachments"
  ON crm_deal_attachments
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage bucket para arquivos anexados a deals
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('deal-attachments', 'deal-attachments', true, 52428800)
ON CONFLICT (id) DO NOTHING;
