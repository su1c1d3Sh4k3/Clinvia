-- Fix user signup: create both profile AND team_member with role='admin'
-- This ensures new users are properly set up as admin of their own account

-- Drop existing trigger to replace it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create improved function that handles both profile and team_member creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile entry
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create team_member entry with role='admin' 
  -- The user_id here references the same user as the owner of this account
  -- All resources they create will be linked to this user_id
  INSERT INTO public.team_members (
    user_id,
    auth_user_id,
    name,
    email,
    role
  )
  VALUES (
    NEW.id,  -- user_id: the owner of the account
    NEW.id,  -- auth_user_id: the auth user (same for admin)
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'admin'::user_role
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Also ensure team_members has auth_user_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE public.team_members ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add full_name column to team_members if missing (some queries use it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.team_members ADD COLUMN full_name TEXT;
    -- Copy name to full_name for existing records
    UPDATE public.team_members SET full_name = name WHERE full_name IS NULL;
  END IF;
END $$;
