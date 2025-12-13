-- Add user_name column to instances table
ALTER TABLE instances
ADD COLUMN IF NOT EXISTS user_name TEXT;
