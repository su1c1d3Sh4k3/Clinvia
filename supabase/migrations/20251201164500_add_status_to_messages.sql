-- Add missing 'status' column to messages table
-- Fixes PGRST204: Could not find the 'status' column of 'messages' in the schema cache

ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'delivered';

-- Force schema cache reload (just in case)
NOTIFY pgrst, 'reload schema';
