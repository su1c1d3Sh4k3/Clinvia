-- Add missing columns to contacts table for frontend contact modal
-- This migration adds: company, cpf, email, instagram, phone (formatted)

-- Add company column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;

-- Add cpf column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cpf TEXT;

-- Add email column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;

-- Add instagram column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Add phone column (formatted phone number, different from 'number' which is wa_chatid)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add comments
COMMENT ON COLUMN contacts.company IS 'Company/organization name for the contact';
COMMENT ON COLUMN contacts.cpf IS 'CPF (Brazilian tax ID) of the contact';
COMMENT ON COLUMN contacts.email IS 'Email address of the contact';
COMMENT ON COLUMN contacts.instagram IS 'Instagram username of the contact';
COMMENT ON COLUMN contacts.phone IS 'Formatted phone number (e.g., +55 11 99999-9999), different from number which is the WhatsApp ID';
