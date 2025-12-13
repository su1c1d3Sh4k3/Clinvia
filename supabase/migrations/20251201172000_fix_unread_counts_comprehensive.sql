-- Reset unread_count for ALL conversations that are NOT 'open' or 'pending'
UPDATE conversations
SET unread_count = 0
WHERE status NOT IN ('open', 'pending') AND unread_count > 0;

-- Optional: Reset unread_count for NULL status as well
UPDATE conversations
SET unread_count = 0
WHERE status IS NULL AND unread_count > 0;
