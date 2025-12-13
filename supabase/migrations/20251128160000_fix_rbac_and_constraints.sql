-- 1. Fix handle_new_user trigger to prevent creating profiles for team members
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is a team member (flagged in metadata)
  IF new.raw_user_meta_data->>'is_team_member' = 'true' THEN
    RETURN new;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix response_times foreign key to allow cascade delete
ALTER TABLE public.response_times
DROP CONSTRAINT IF EXISTS response_times_conversation_id_fkey;

ALTER TABLE public.response_times
ADD CONSTRAINT response_times_conversation_id_fkey
FOREIGN KEY (conversation_id)
REFERENCES public.conversations(id)
ON DELETE CASCADE;

-- 3. Update Tags RLS to allow all authenticated users to view tags
DROP POLICY IF EXISTS "Users can view their own tags" ON public.tags;

DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;

CREATE POLICY "Authenticated users can view tags"
ON public.tags FOR SELECT
TO authenticated
USING (true);

-- Keep other tag policies restricted to owner (admin)
-- "Users can insert their own tags" -> Already exists, keeps it admin-only (effectively) if only admins use the UI
-- "Users can update their own tags" -> Already exists
-- "Users can delete their own tags" -> Already exists
