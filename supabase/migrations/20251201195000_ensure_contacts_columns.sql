-- Ensure phone column exists
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Create or replace function to populate phone from remote_jid
CREATE OR REPLACE FUNCTION public.populate_phone_from_jid()
RETURNS TRIGGER AS $$
BEGIN
  -- Only populate if phone is null or empty
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    -- Extract number from remote_jid (e.g., 5511999999999@s.whatsapp.net -> 5511999999999)
    NEW.phone := split_part(NEW.remote_jid, '@', 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically populate phone
DROP TRIGGER IF EXISTS trigger_populate_phone ON public.contacts;
CREATE TRIGGER trigger_populate_phone
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.populate_phone_from_jid();

-- Backfill existing records
UPDATE public.contacts
SET phone = split_part(remote_jid, '@', 1)
WHERE phone IS NULL OR phone = '';
