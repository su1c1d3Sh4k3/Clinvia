-- ============================================================================
-- Contatos Instagram: garantir 1 contato por (user_id, instagram_id)
-- ============================================================================
-- O instagram-webhook identifica o cliente pelo IGSID (contacts.instagram_id),
-- mas o padrão select-then-insert sem constraint única permite duplicar
-- contato em corrida (webhooks simultâneos / redeliveries da Meta).
--
-- 1) Dedupe defensivo (hoje não há duplicatas, mas garante idempotência):
--    mantém o contato mais antigo, reaponta conversas e remove o resto.
-- 2) Índice único parcial em (user_id, instagram_id).
-- ============================================================================

-- 1) Dedupe: reapontar conversas dos duplicados para o contato mais antigo
WITH ranked AS (
    SELECT id, user_id, instagram_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, instagram_id ORDER BY created_at) AS rn,
           FIRST_VALUE(id) OVER (PARTITION BY user_id, instagram_id ORDER BY created_at) AS keep_id
    FROM contacts
    WHERE instagram_id IS NOT NULL
)
UPDATE conversations cv
SET contact_id = r.keep_id
FROM ranked r
WHERE cv.contact_id = r.id AND r.rn > 1;

WITH ranked AS (
    SELECT id, user_id, instagram_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, instagram_id ORDER BY created_at) AS rn
    FROM contacts
    WHERE instagram_id IS NOT NULL
)
DELETE FROM contacts c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 2) Índice único parcial
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_user_instagram_id
    ON contacts (user_id, instagram_id)
    WHERE instagram_id IS NOT NULL;
