-- Upload no bucket "media": tirar a varredura completa de conversations da policy.
--
-- A policy comparava `(c.id)::text = foldername[1]`. O cast impede o uso do
-- indice primario, entao TODO upload varria as 21.8k conversas com RLS ligada
-- (~575ms so no service role; com a RLS do usuario estoura o tempo do Storage
-- e vira "Database connection timeout"). Para um caminho que nao e uuid, como
-- template-headers/<ownerId>/..., a varredura era garantida e inutil.
--
-- Agora: CASE garante a ordem de avaliacao (o regex roda antes do cast, sem
-- risco de "invalid input syntax for type uuid") e a comparacao por uuid usa
-- conversations_pkey.

DROP POLICY IF EXISTS "Authenticated upload to own conversations" ON storage.objects;
CREATE POLICY "Authenticated upload to own conversations"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'media'
    AND (
        CASE
            WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN EXISTS (
                    SELECT 1 FROM conversations c
                    WHERE c.id = ((storage.foldername(name))[1])::uuid
                      AND c.user_id = (SELECT get_my_owner_id())
                )
            ELSE false
        END
        OR (SELECT auth.uid()) IN (SELECT p.id FROM profiles p WHERE p.role = 'super-admin')
    )
);
