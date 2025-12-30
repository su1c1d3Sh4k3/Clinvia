-- Migration: Add voice AI settings to ia_config table
-- voice: boolean to enable/disable AI voice responses
-- genre: string for voice gender ('male' or 'female')

-- 1. Adicionar coluna voice (boolean, default FALSE)
ALTER TABLE ia_config ADD COLUMN IF NOT EXISTS voice BOOLEAN DEFAULT FALSE;

-- 2. Adicionar coluna genre (texto para gênero da voz)
ALTER TABLE ia_config ADD COLUMN IF NOT EXISTS genre TEXT DEFAULT 'female';
