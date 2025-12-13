-- Reset unread_count to 0 for all resolved conversations
UPDATE conversations
SET unread_count = 0
WHERE status = 'resolved' AND unread_count > 0;
