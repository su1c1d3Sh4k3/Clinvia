-- =============================================
-- Migration: Add openai_token to profiles
-- Date: 2026-01-06
-- =============================================

-- Add custom OpenAI token column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS openai_token TEXT DEFAULT NULL;

-- Add column to track if token is invalid (for alerts)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS openai_token_invalid BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN profiles.openai_token IS 'Custom OpenAI API token for this profile. If set, will be used instead of platform default.';
COMMENT ON COLUMN profiles.openai_token_invalid IS 'Flag indicating if the custom token has failed and needs attention.';

-- Note: This column is protected by existing RLS policies on profiles table
-- Only the profile owner can see/update their own openai_token
