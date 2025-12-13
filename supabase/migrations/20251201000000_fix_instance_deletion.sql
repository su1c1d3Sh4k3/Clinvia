-- Fix instance deletion by changing foreign key constraint on conversations
-- Drop the existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_instance_id_fkey') THEN
        ALTER TABLE conversations DROP CONSTRAINT conversations_instance_id_fkey;
    END IF;
END $$;

-- Add the new constraint with ON DELETE SET NULL
ALTER TABLE conversations
ADD CONSTRAINT conversations_instance_id_fkey
FOREIGN KEY (instance_id)
REFERENCES instances(id)
ON DELETE SET NULL;
