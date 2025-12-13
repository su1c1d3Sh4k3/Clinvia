-- Migration: Add auto_complete field to scheduling_settings
-- This enables automatic completion of confirmed appointments when end_time is reached

-- Add auto_complete column to scheduling_settings
ALTER TABLE scheduling_settings ADD COLUMN IF NOT EXISTS auto_complete BOOLEAN DEFAULT false;

-- Create revenue category "Agendamento" if it doesn't exist (will be done per user in code)
-- Note: Revenue categories are user-specific, so we can't create globally here
