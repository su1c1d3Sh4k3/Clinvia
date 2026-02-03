-- Migration: Add UNIQUE constraint to evolution_id to prevent message duplication
-- This prevents the same message from being saved twice when evolution-send-message
-- and webhooks both try to insert the same message

-- Step 1: Remove existing duplicates (if any)
-- Find and keep only the most recent message for each duplicate evolution_id
WITH duplicate_messages AS (
    SELECT 
        id,
        evolution_id,
        ROW_NUMBER() OVER (
            PARTITION BY evolution_id 
            ORDER BY created_at DESC
        ) as rn
    FROM messages
    WHERE evolution_id IS NOT NULL
)
DELETE FROM messages
WHERE id IN (
    SELECT id 
    FROM duplicate_messages 
    WHERE rn > 1
);

-- Step 2: Add UNIQUE constraint
ALTER TABLE messages 
ADD CONSTRAINT messages_evolution_id_unique 
UNIQUE (evolution_id);

-- Note: This constraint will cause INSERT to fail with error 23505 if duplicate evolution_id is attempted
-- Webhooks should check for existing messages before inserting when fromMe=true
