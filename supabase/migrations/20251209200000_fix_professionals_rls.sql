-- Fix professionals RLS policy to allow SELECT for all authenticated users
-- Current policy only allows users to see their own professionals (user_id = auth.uid())
-- But we need all users in company to see all professionals for dropdowns/selects

-- Drop existing overly restrictive policy
DROP POLICY IF EXISTS "Users can manage their own professionals" ON public.professionals;

-- Create separate policies for different operations
CREATE POLICY "Users can view all professionals"
    ON public.professionals
    FOR SELECT
    TO authenticated
    USING (true); -- Allow all authenticated users to read all professionals

CREATE POLICY "Users can insert own professionals"
    ON public.professionals
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own professionals"
    ON public.professionals
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own professionals"
    ON public.professionals
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
