-- Migration: Add agent_name column to ia_config table
-- This field stores the name of the AI agent for the company

-- 1. Adicionar coluna agent_name à tabela ia_config
ALTER TABLE ia_config ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- 2. Índice para busca (opcional)
CREATE INDEX IF NOT EXISTS idx_ia_config_agent_name ON ia_config(agent_name);
