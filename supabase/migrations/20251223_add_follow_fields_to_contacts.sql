-- Migration: Add follow-up tracking fields to contacts table
-- These fields are manually managed for tracking contact follow-up status

-- 1. Adicionar coluna message_date
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS message_date TEXT;

-- 2. Adicionar coluna follow_status
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_status TEXT;

-- 3. Adicionar coluna follow_stage
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_stage TEXT;

-- 4. Criar índices para busca/filtro (opcional, útil para queries)
CREATE INDEX IF NOT EXISTS idx_contacts_follow_status ON contacts(follow_status);
CREATE INDEX IF NOT EXISTS idx_contacts_follow_stage ON contacts(follow_stage);
