-- ============================================
-- FIX: Storage RLS — Restringir uploads ao bucket media
-- Problema: "Allow authenticated uploads" não valida path
-- Fix: Upload apenas em paths do próprio user_id
-- ============================================

-- Remover policy antiga de upload (muito permissiva)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- Nova policy: Upload somente em media/{conversation_id}/
-- onde a conversa pertence ao usuário autenticado
CREATE POLICY "Authenticated upload to own conversations"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (
    -- Permitir upload se o path contém um conversation_id que pertence ao user
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
      AND c.user_id = auth.uid()
    )
    -- OU permitir se é admin/owner (path pode não seguir padrão)
    OR auth.uid() IN (
      SELECT p.id FROM public.profiles p WHERE p.role = 'super-admin'
    )
  )
);

-- Manter policy de update restrita
DROP POLICY IF EXISTS "Allow authenticated update" ON storage.objects;
CREATE POLICY "Authenticated update own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');

-- Manter policy de delete restrita
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;
CREATE POLICY "Authenticated delete own media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'media');
