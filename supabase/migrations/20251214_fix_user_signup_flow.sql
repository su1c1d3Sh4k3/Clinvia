-- EMERGENCY FIX: Properly handle user signup trigger
-- The issue is that the trigger might be failing due to:
-- 1. UNIQUE constraint on user_id without proper ON CONFLICT specification
-- 2. Missing columns

-- First, ensure all required columns exist
DO $$
BEGIN
  -- Add auth_user_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE public.team_members ADD COLUMN auth_user_id UUID;
  END IF;
  
  -- Add full_name if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.team_members ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create ROBUST function that handles errors gracefully
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_team_member_id UUID;
BEGIN
  -- Create profile entry (this should work as profiles.id has ON CONFLICT)
  BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Profile creation error: %', SQLERRM;
  END;

  -- Check if team_member already exists for this user
  SELECT id INTO existing_team_member_id 
  FROM public.team_members 
  WHERE user_id = NEW.id;
  
  IF existing_team_member_id IS NULL THEN
    -- Create new team_member
    BEGIN
      INSERT INTO public.team_members (user_id, auth_user_id, name, email, role)
      VALUES (
        NEW.id,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'admin'::user_role
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Team member creation error: %', SQLERRM;
      -- Don't fail the entire signup, just log the error
    END;
  ELSE
    -- Update existing team_member with auth_user_id if missing
    UPDATE public.team_members 
    SET auth_user_id = NEW.id,
        email = COALESCE(email, NEW.email)
    WHERE id = existing_team_member_id AND auth_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
