-- Migration: Create manuals storage bucket
-- This creates a public bucket for storing system manuals that Bia AI can read

-- Note: Bucket creation must be done via Supabase Dashboard or API
-- This migration serves as documentation of the required setup

-- Steps to create the bucket manually:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: "manuals"
-- 4. Check "Public bucket"
-- 5. Click "Create bucket"

-- After creating the bucket, upload all .md files from the /manuais folder:
-- - inbox.md
-- - crm.md
-- - tasks.md
-- - scheduling.md
-- - sales.md
-- - team.md
-- - ia-config.md
-- - whatsapp-connection.md
-- - settings.md
-- - products-services.md
-- - contacts.md
-- - queues.md
-- - tags.md
-- - follow-up.md
-- - dashboard.md (create if not exists)
-- - default.md

-- Storage policy for public read access (if bucket is public, this is automatic)
-- This is just for reference if you need custom policies

-- Allow public read access to manuals bucket
-- CREATE POLICY "Public read manuals"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'manuals');

-- Allow service role to upload/update manuals
-- CREATE POLICY "Service role manage manuals"
-- ON storage.objects FOR ALL
-- TO service_role
-- USING (bucket_id = 'manuals');
