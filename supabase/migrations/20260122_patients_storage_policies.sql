-- Storage Policies for patients buckets
-- Execute no SQL Editor do Supabase

-- 1. Policies para bucket "patients-docs"
INSERT INTO storage.buckets (id, name, public)
VALUES ('patients-docs', 'patients-docs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated users can upload patient docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patients-docs');

CREATE POLICY "Authenticated users can view patient docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patients-docs');

CREATE POLICY "Authenticated users can update patient docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patients-docs');

CREATE POLICY "Authenticated users can delete patient docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patients-docs');

-- 2. Policies para bucket "patients-photos"
INSERT INTO storage.buckets (id, name, public)
VALUES ('patients-photos', 'patients-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated users can upload patient photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patients-photos');

CREATE POLICY "Authenticated users can view patient photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patients-photos');

CREATE POLICY "Authenticated users can update patient photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patients-photos');

CREATE POLICY "Authenticated users can delete patient photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patients-photos');
