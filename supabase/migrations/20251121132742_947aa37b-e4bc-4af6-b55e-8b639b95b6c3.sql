-- Add fields needed for Evolution API integration
ALTER TABLE instances 
ADD COLUMN IF NOT EXISTS instance_name TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS qr_code TEXT,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;