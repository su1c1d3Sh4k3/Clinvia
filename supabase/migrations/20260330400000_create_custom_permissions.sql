-- Create custom_permissions table for role-based permission customization
-- Allows admins to grant/revoke create/edit/delete permissions per feature per role

CREATE TABLE IF NOT EXISTS public.custom_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('supervisor', 'agent')),
    feature TEXT NOT NULL,
    can_create BOOLEAN NOT NULL DEFAULT false,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, role, feature)
);

ALTER TABLE public.custom_permissions ENABLE ROW LEVEL SECURITY;

-- All team members can read permissions for their tenant (needed for usePermissions hook)
CREATE POLICY "Team can read custom permissions"
    ON public.custom_permissions FOR SELECT TO authenticated
    USING (user_id = get_owner_id());

-- Only admins can insert
CREATE POLICY "Admin can insert custom permissions"
    ON public.custom_permissions FOR INSERT TO authenticated
    WITH CHECK (user_id = get_owner_id() AND is_admin());

-- Only admins can update
CREATE POLICY "Admin can update custom permissions"
    ON public.custom_permissions FOR UPDATE TO authenticated
    USING (user_id = get_owner_id() AND is_admin())
    WITH CHECK (user_id = get_owner_id() AND is_admin());

-- Only admins can delete
CREATE POLICY "Admin can delete custom permissions"
    ON public.custom_permissions FOR DELETE TO authenticated
    USING (user_id = get_owner_id() AND is_admin());
