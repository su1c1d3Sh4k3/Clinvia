-- Migration: Add convenio column to ia_config table
-- Stores multiple convenios in text format

ALTER TABLE ia_config ADD COLUMN IF NOT EXISTS convenio TEXT;

-- Add comment for documentation
COMMENT ON COLUMN ia_config.convenio IS 'Stores convenio data in formatted text. Format: 1. Nome\n- Valor Primeira: R$ X\n- Valor Demais: R$ X\n- Previsão: X dias';
