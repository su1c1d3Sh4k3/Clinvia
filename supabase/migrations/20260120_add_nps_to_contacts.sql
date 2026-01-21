-- Migration: Add NPS field to contacts table
-- Stores array of satisfaction survey responses

-- Add nps column as JSONB array
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nps JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for efficient queries on the array
CREATE INDEX IF NOT EXISTS idx_contacts_nps ON contacts USING GIN (nps);

-- Add comment for documentation
COMMENT ON COLUMN contacts.nps IS 'Array of NPS survey responses: [{dataPesquisa, nota, feedback}]';
