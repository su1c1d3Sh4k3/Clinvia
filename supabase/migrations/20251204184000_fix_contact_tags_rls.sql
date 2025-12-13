-- Fix contact_tags RLS to match the permissive tags and contacts policies
-- Previously, it required the user to own the tag, but tags are now shared.

DROP POLICY IF EXISTS "Users can view their own contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can insert their own contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can delete their own contact tags" ON public.contact_tags;

-- Create new permissive policies for authenticated users
CREATE POLICY "Authenticated users can view contact_tags"
ON public.contact_tags FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert contact_tags"
ON public.contact_tags FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contact_tags"
ON public.contact_tags FOR DELETE
TO authenticated
USING (true);
