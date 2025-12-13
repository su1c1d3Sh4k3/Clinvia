-- Remove duplicates if any (keeping the latest one based on created_at or id)
DELETE FROM messages a USING messages b
WHERE a.id < b.id AND a.evolution_id = b.evolution_id AND a.evolution_id IS NOT NULL;

-- Add unique constraint
ALTER TABLE messages ADD CONSTRAINT messages_evolution_id_key UNIQUE (evolution_id);
