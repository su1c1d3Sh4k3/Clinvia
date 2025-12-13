-- Migration to fix missing unique constraint on messages table
-- This fixes the "42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification" error

-- 1. Ensure 'evolution_id' is unique in 'messages' table
DO $$
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'messages_evolution_id_key'
    ) THEN
        -- First, remove any duplicate messages that might exist (keeping the latest one)
        -- This is necessary because we can't add a unique constraint if duplicates exist
        DELETE FROM messages a USING messages b
        WHERE a.id < b.id 
        AND a.evolution_id = b.evolution_id 
        AND a.evolution_id IS NOT NULL;

        -- Now add the unique constraint
        ALTER TABLE messages ADD CONSTRAINT messages_evolution_id_key UNIQUE (evolution_id);
        
        RAISE NOTICE 'Added unique constraint messages_evolution_id_key';
    ELSE
        RAISE NOTICE 'Constraint messages_evolution_id_key already exists';
    END IF;
END $$;

-- 2. Verify other constraints used in upserts (just to be safe)

-- Contacts: remote_jid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contacts_remote_jid_key'
    ) THEN
        ALTER TABLE contacts ADD CONSTRAINT contacts_remote_jid_key UNIQUE (remote_jid);
    END IF;
END $$;

-- Groups: remote_jid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'groups_remote_jid_key'
    ) THEN
        ALTER TABLE groups ADD CONSTRAINT groups_remote_jid_key UNIQUE (remote_jid);
    END IF;
END $$;

-- Group Members: group_id, remote_jid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'group_members_group_id_remote_jid_key'
    ) THEN
        ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_remote_jid_key UNIQUE (group_id, remote_jid);
    END IF;
END $$;
