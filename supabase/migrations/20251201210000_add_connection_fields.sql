-- Add fields for instance connection via phone pairing
ALTER TABLE instances
ADD COLUMN IF NOT EXISTS pin_code TEXT,
ADD COLUMN IF NOT EXISTS client_number TEXT;
