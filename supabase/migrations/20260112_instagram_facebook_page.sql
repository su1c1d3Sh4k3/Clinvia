-- Migration: Add Facebook Page fields to instagram_instances
-- Required for Instagram Messaging via Messenger Platform

-- Add Facebook Page ID (required for messaging API)
ALTER TABLE instagram_instances 
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;

-- Add Facebook Page name for display
ALTER TABLE instagram_instances 
ADD COLUMN IF NOT EXISTS facebook_page_name TEXT;

-- Create index for faster lookup by page_id
CREATE INDEX IF NOT EXISTS idx_instagram_instances_facebook_page_id 
ON instagram_instances(facebook_page_id);

-- Add comment
COMMENT ON COLUMN instagram_instances.facebook_page_id IS 'Facebook Page ID linked to Instagram account - required for Messenger Platform API';
COMMENT ON COLUMN instagram_instances.facebook_page_name IS 'Facebook Page name for display purposes';
