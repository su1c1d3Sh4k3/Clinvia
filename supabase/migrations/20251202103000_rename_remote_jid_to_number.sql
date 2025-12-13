-- Rename remote_jid to number in contacts table
ALTER TABLE public.contacts RENAME COLUMN remote_jid TO number;
