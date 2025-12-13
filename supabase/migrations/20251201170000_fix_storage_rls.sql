-- Create 'media' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload files to 'media' bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

-- Policy to allow authenticated users to view files in 'media' bucket
CREATE POLICY "Allow authenticated viewing"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'media');

-- Policy to allow public viewing (optional, if you want public access)
CREATE POLICY "Allow public viewing"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'media');
