-- Migration: Add IA toggle fields to instances tables
-- Date: 2025-12-24

-- 1. Add ia_on_wpp to instances table (WhatsApp)
-- Default TRUE so existing instances are enabled when user turns on IA
ALTER TABLE instances ADD COLUMN IF NOT EXISTS ia_on_wpp BOOLEAN DEFAULT TRUE;

-- 2. Add ia_on_insta to instagram_instances table
-- Default TRUE so existing instances are enabled when user turns on IA
ALTER TABLE instagram_instances ADD COLUMN IF NOT EXISTS ia_on_insta BOOLEAN DEFAULT TRUE;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_instances_ia_on_wpp ON instances(ia_on_wpp);
CREATE INDEX IF NOT EXISTS idx_instagram_instances_ia_on_insta ON instagram_instances(ia_on_insta);

-- 4. Comments
COMMENT ON COLUMN instances.ia_on_wpp IS 'Whether AI is enabled for this WhatsApp instance';
COMMENT ON COLUMN instagram_instances.ia_on_insta IS 'Whether AI is enabled for this Instagram instance';
