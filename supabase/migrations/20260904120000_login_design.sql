-- Design da tela de login: banner opcional configurado no painel admin.
-- Linha unica (singleton) porque a tela de login e a mesma para toda a plataforma.

CREATE TABLE IF NOT EXISTS public.login_design (
    id boolean PRIMARY KEY DEFAULT true,
    image_url text,
    link_url text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    CONSTRAINT login_design_singleton CHECK (id)
);

INSERT INTO public.login_design (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.login_design ENABLE ROW LEVEL SECURITY;

-- A tela de login e ANONIMA: sem leitura para anon o banner nunca apareceria.
DROP POLICY IF EXISTS "login_design_read_all" ON public.login_design;
CREATE POLICY "login_design_read_all" ON public.login_design
    FOR SELECT TO anon, authenticated USING (true);

-- Escrita so pelo painel admin (admin_can ja curto-circuita super-admin).
DROP POLICY IF EXISTS "login_design_update_admin" ON public.login_design;
CREATE POLICY "login_design_update_admin" ON public.login_design
    FOR UPDATE TO authenticated
    USING (public.admin_can('design-login', 'edit'))
    WITH CHECK (public.admin_can('design-login', 'edit'));

-- Bucket publico do banner.
INSERT INTO storage.buckets (id, name, public)
VALUES ('login-design', 'login-design', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "login_design_objects_read" ON storage.objects;
CREATE POLICY "login_design_objects_read" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'login-design');

DROP POLICY IF EXISTS "login_design_objects_insert" ON storage.objects;
CREATE POLICY "login_design_objects_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'login-design' AND public.admin_can('design-login', 'edit'));

DROP POLICY IF EXISTS "login_design_objects_update" ON storage.objects;
CREATE POLICY "login_design_objects_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'login-design' AND public.admin_can('design-login', 'edit'));

DROP POLICY IF EXISTS "login_design_objects_delete" ON storage.objects;
CREATE POLICY "login_design_objects_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'login-design' AND public.admin_can('design-login', 'edit'));
