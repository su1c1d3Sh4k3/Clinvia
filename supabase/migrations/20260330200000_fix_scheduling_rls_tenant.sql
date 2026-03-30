-- Fix scheduling RLS policies to use get_owner_id() so supervisors can manage
-- scheduling settings, professionals, and appointments on behalf of their tenant.

-- ============================================================
-- scheduling_settings
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own scheduling settings" ON public.scheduling_settings;
DROP POLICY IF EXISTS "Users can insert their own scheduling settings" ON public.scheduling_settings;
DROP POLICY IF EXISTS "Users can update their own scheduling settings" ON public.scheduling_settings;
DROP POLICY IF EXISTS "Users can delete their own scheduling settings" ON public.scheduling_settings;

CREATE POLICY "Team can view scheduling settings"
    ON public.scheduling_settings FOR SELECT
    TO authenticated
    USING (user_id = get_owner_id());

CREATE POLICY "Team can insert scheduling settings"
    ON public.scheduling_settings FOR INSERT
    TO authenticated
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can update scheduling settings"
    ON public.scheduling_settings FOR UPDATE
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can delete scheduling settings"
    ON public.scheduling_settings FOR DELETE
    TO authenticated
    USING (user_id = get_owner_id());

-- ============================================================
-- professionals (INSERT / UPDATE / DELETE already split in 20251209200000)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can update own professionals" ON public.professionals;
DROP POLICY IF EXISTS "Users can delete own professionals" ON public.professionals;

CREATE POLICY "Team can insert professionals"
    ON public.professionals FOR INSERT
    TO authenticated
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can update professionals"
    ON public.professionals FOR UPDATE
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can delete professionals"
    ON public.professionals FOR DELETE
    TO authenticated
    USING (user_id = get_owner_id());

-- ============================================================
-- appointments
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own appointments" ON public.appointments;

CREATE POLICY "Team can manage appointments"
    ON public.appointments FOR ALL
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());
