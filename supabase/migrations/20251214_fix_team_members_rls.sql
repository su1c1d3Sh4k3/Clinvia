-- Fix RLS policies for team_members to allow users to access their own record
-- The previous policies only check user_id or is_admin(), but we need to also check auth_user_id

-- Add policy for users to view their own team record via auth_user_id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'team_members' 
    AND policyname = 'Users can view own record via auth_user_id'
  ) THEN
    CREATE POLICY "Users can view own record via auth_user_id"
      ON public.team_members FOR SELECT
      TO authenticated
      USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- Also update the existing policy to include auth_user_id check
DROP POLICY IF EXISTS "Users can view their own team record" ON public.team_members;

CREATE POLICY "Users can view their own team record"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR auth_user_id = auth.uid());

-- Ensure team_members has proper unique constraints to avoid duplicates
-- First check if constraint exists
DO $$
BEGIN
  -- Add unique constraint on auth_user_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'team_members_auth_user_id_key'
  ) THEN
    -- Only add if column exists and has no duplicates
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'team_members' AND column_name = 'auth_user_id'
    ) THEN
      BEGIN
        ALTER TABLE public.team_members ADD CONSTRAINT team_members_auth_user_id_key UNIQUE (auth_user_id);
      EXCEPTION
        WHEN unique_violation THEN
          RAISE NOTICE 'Duplicate auth_user_id values exist, skipping unique constraint';
        WHEN OTHERS THEN
          RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;
