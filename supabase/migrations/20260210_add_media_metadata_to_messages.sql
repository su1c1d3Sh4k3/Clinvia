-- Migration: Add media metadata columns to messages table
-- Adds support for storing original filename and MIME type
-- Created: 2026-02-10

-- Add media_filename column to store original filename
ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS media_filename TEXT;

-- Add media_mimetype column to store MIME type
ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS media_mimetype TEXT;

-- Add comments for documentation
COMMENT ON COLUMN messages.media_filename IS 'Original filename of uploaded media (e.g., documento.pdf, relatorio.xlsx)';
COMMENT ON COLUMN messages.media_mimetype IS 'MIME type of the media file (e.g., application/pdf, image/png)';

-- Create index for better query performance on filename searches
CREATE INDEX IF NOT EXISTS idx_messages_media_filename ON messages(media_filename) 
WHERE media_filename IS NOT NULL;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Media metadata migration completed successfully';
    RAISE NOTICE 'Added media_filename and media_mimetype columns to messages table';
END $$;
