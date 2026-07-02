-- =============================================================================
-- Migration: Meta WhatsApp Cloud API Integration
-- Adds provider support to instances + message_templates table
-- ZERO impact on existing UZAPI functionality
-- =============================================================================

-- 1. Add provider column to instances (default 'uzapi' preserves all existing)
ALTER TABLE instances ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'uzapi';

-- 2. Add Meta-specific columns to instances
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS meta_access_token TEXT;

-- 3. Create message_templates table for Meta templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,

  name TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  status TEXT NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT,

  components JSONB NOT NULL DEFAULT '[]'::jsonb,

  meta_template_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(waba_id, name, language)
);

-- 4. RLS for message_templates
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON message_templates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own templates"
  ON message_templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own templates"
  ON message_templates FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own templates"
  ON message_templates FOR DELETE
  USING (user_id = auth.uid());

-- 5. Service role bypass for edge functions
CREATE POLICY "Service role full access templates"
  ON message_templates FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Index for performance
CREATE INDEX IF NOT EXISTS idx_message_templates_user_id ON message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_waba_id ON message_templates(waba_id);
CREATE INDEX IF NOT EXISTS idx_instances_provider ON instances(provider);
CREATE INDEX IF NOT EXISTS idx_instances_meta_phone_number_id ON instances(meta_phone_number_id);
