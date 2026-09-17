-- Cabeçalho de imagem nos templates da Meta
--
-- A imagem é FIXA: o cliente sobe uma vez e todo envio daquele template usa a
-- mesma URL. O handle da Resumable Upload API só serve para a Meta aprovar o
-- template; no envio a Meta exige o parâmetro de header com um link público.
--
-- Por que colunas dedicadas e não dentro de `components`: a action `sync` do
-- meta-template-manage sobrescreve `components` com o que a Meta devolve
-- (index.ts:92) — a URL guardada lá seria apagada no primeiro sync.

ALTER TABLE public.message_templates
    ADD COLUMN IF NOT EXISTS header_format TEXT,
    ADD COLUMN IF NOT EXISTS header_media_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_header_format_check'
    ) THEN
        ALTER TABLE public.message_templates
            ADD CONSTRAINT message_templates_header_format_check
            CHECK (header_format IS NULL OR header_format IN ('TEXT', 'IMAGE'));
    END IF;
END $$;

COMMENT ON COLUMN public.message_templates.header_format IS
    'Formato do cabeçalho: TEXT, IMAGE ou NULL (sem cabeçalho). Espelha components[HEADER].format, mas sobrevive ao sync com a Meta.';
COMMENT ON COLUMN public.message_templates.header_media_url IS
    'URL pública (bucket media) da imagem fixa do cabeçalho. Enviada em todo disparo como parâmetro de header; NULL quando header_format <> IMAGE.';

-- Backfill: templates existentes têm cabeçalho de texto ou nenhum.
UPDATE public.message_templates t
SET header_format = CASE
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(t.components) c
            WHERE upper(c->>'type') = 'HEADER'
        ) THEN 'TEXT'
        ELSE NULL
    END
WHERE t.header_format IS NULL
  AND jsonb_typeof(t.components) = 'array';
