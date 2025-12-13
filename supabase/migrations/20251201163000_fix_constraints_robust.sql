-- Robust migration to fix missing/conflicting constraints
-- This script safely handles existing constraints/indexes to avoid "relation already exists" errors

DO $$
BEGIN
    -- ==========================================
    -- 1. MESSAGES TABLE (evolution_id)
    -- ==========================================
    
    -- Drop constraint if it exists (to ensure we can recreate it correctly)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_evolution_id_key') THEN
        ALTER TABLE messages DROP CONSTRAINT messages_evolution_id_key;
    END IF;

    -- Drop index if it exists (sometimes indexes exist without the constraint, causing 42P07)
    DROP INDEX IF EXISTS messages_evolution_id_key;

    -- Remove duplicates (Essential before adding unique constraint)
    -- Keeps the latest message (highest ID)
    DELETE FROM messages a USING messages b
    WHERE a.id < b.id 
    AND a.evolution_id = b.evolution_id 
    AND a.evolution_id IS NOT NULL;

    -- Add the unique constraint
    ALTER TABLE messages ADD CONSTRAINT messages_evolution_id_key UNIQUE (evolution_id);
    RAISE NOTICE 'Fixed messages_evolution_id_key';


    -- ==========================================
    -- 2. CONTACTS TABLE (remote_jid)
    -- ==========================================
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_remote_jid_key') THEN
        ALTER TABLE contacts DROP CONSTRAINT contacts_remote_jid_key;
    END IF;
    DROP INDEX IF EXISTS contacts_remote_jid_key;

    -- Remove duplicates
    DELETE FROM contacts a USING contacts b
    WHERE a.id < b.id AND a.remote_jid = b.remote_jid;

    ALTER TABLE contacts ADD CONSTRAINT contacts_remote_jid_key UNIQUE (remote_jid);
    RAISE NOTICE 'Fixed contacts_remote_jid_key';


    -- ==========================================
    -- 3. GROUPS TABLE (remote_jid)
    -- ==========================================
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_remote_jid_key') THEN
        ALTER TABLE groups DROP CONSTRAINT groups_remote_jid_key;
    END IF;
    DROP INDEX IF EXISTS groups_remote_jid_key;

    -- Remove duplicates
    DELETE FROM groups a USING groups b
    WHERE a.id < b.id AND a.remote_jid = b.remote_jid;

    ALTER TABLE groups ADD CONSTRAINT groups_remote_jid_key UNIQUE (remote_jid);
    RAISE NOTICE 'Fixed groups_remote_jid_key';

    -- ==========================================
    -- 4. GROUP MEMBERS TABLE (group_id, remote_jid)
    -- ==========================================

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_group_id_remote_jid_key') THEN
        ALTER TABLE group_members DROP CONSTRAINT group_members_group_id_remote_jid_key;
    END IF;
    DROP INDEX IF EXISTS group_members_group_id_remote_jid_key;

    -- Remove duplicates
    DELETE FROM group_members a USING group_members b
    WHERE a.id < b.id 
    AND a.group_id = b.group_id 
    AND a.remote_jid = b.remote_jid;

    ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_remote_jid_key UNIQUE (group_id, remote_jid);
    RAISE NOTICE 'Fixed group_members_group_id_remote_jid_key';

END $$;
