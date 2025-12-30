-- Migration: Add workflow_id column to ia_config table
-- This column is used to store the workflow ID manually

-- 1. Add workflow_id column to ia_config table
ALTER TABLE ia_config ADD COLUMN IF NOT EXISTS workflow_id TEXT;

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ia_config_workflow_id ON ia_config(workflow_id);
