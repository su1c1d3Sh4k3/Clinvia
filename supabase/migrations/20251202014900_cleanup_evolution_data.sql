-- Clean up all contacts, conversations, and messages from Evolution API era
-- This migration removes all old data to start fresh with Uzapi

-- Step 1: Delete all messages (child of conversations)
DELETE FROM public.messages;

-- Step 2: Delete all AI analysis (child of conversations)
DELETE FROM public.ai_analysis;

-- Step 3: Delete dados_atendimento (has FK to conversations)
DELETE FROM public.dados_atendimento;

-- Step 4: Delete all conversations (child of contacts)
DELETE FROM public.conversations;

-- Step 5: Delete all contacts
DELETE FROM public.contacts;

-- Step 6: Delete any contact tags associations
DELETE FROM public.contact_tags;

-- Step 7: Reset sequences if needed (optional, for clean IDs)
-- Not applicable here as we use UUIDs

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Cleaned up all Evolution API data from contacts, conversations, messages, ai_analysis, dados_atendimento, and contact_tags tables';
END $$;
