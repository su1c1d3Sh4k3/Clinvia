-- Cabecalho de imagem do template: permitir upload em media/template-headers/<ownerId>/
--
-- A unica policy de INSERT do bucket "media" era
-- "Authenticated upload to own conversations", que exige que a PRIMEIRA
-- pasta do caminho seja o id de uma conversa do dono. O upload da imagem
-- do cabeçalho grava em template-headers/<ownerId>/... e por isso batia
-- em "new row violates row-level security policy".

DROP POLICY IF EXISTS "template_headers_insert" ON storage.objects;
CREATE POLICY "template_headers_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'template-headers'
    AND (storage.foldername(name))[2] = (SELECT get_owner_id())::text
);

DROP POLICY IF EXISTS "template_headers_update" ON storage.objects;
CREATE POLICY "template_headers_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'template-headers'
    AND (storage.foldername(name))[2] = (SELECT get_owner_id())::text
)
WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'template-headers'
    AND (storage.foldername(name))[2] = (SELECT get_owner_id())::text
);

DROP POLICY IF EXISTS "template_headers_delete" ON storage.objects;
CREATE POLICY "template_headers_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'template-headers'
    AND (storage.foldername(name))[2] = (SELECT get_owner_id())::text
);
