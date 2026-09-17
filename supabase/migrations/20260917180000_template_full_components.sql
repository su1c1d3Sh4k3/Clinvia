-- Templates da Meta: cabeçalho de vídeo/documento/localização e botões completos.
--
-- Mesma razão de 20260917140000 para as colunas dedicadas: a action `sync`
-- sobrescreve `components` com o payload da Meta, que não devolve nem a URL
-- pública da mídia nem o valor fixo do cupom. Tudo que precisa sobreviver ao
-- sync e ser reenviado em TODO disparo mora em coluna própria.

ALTER TABLE public.message_templates
    ADD COLUMN IF NOT EXISTS header_media_name TEXT,
    ADD COLUMN IF NOT EXISTS header_location JSONB,
    ADD COLUMN IF NOT EXISTS button_coupon_code TEXT;

ALTER TABLE public.message_templates
    DROP CONSTRAINT IF EXISTS message_templates_header_format_check;

ALTER TABLE public.message_templates
    ADD CONSTRAINT message_templates_header_format_check
    CHECK (header_format IS NULL OR header_format IN ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'));

COMMENT ON COLUMN public.message_templates.header_format IS
    'Formato do cabeçalho: TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION ou NULL (sem cabeçalho). Espelha components[HEADER].format, mas sobrevive ao sync com a Meta.';
COMMENT ON COLUMN public.message_templates.header_media_url IS
    'URL pública (bucket media) da mídia fixa do cabeçalho — imagem, vídeo ou documento. Enviada em todo disparo como parâmetro de header.';
COMMENT ON COLUMN public.message_templates.header_media_name IS
    'Nome do arquivo exibido no WhatsApp quando header_format = DOCUMENT (a Meta exige o campo filename no envio).';
COMMENT ON COLUMN public.message_templates.header_location IS
    'Localização fixa do cabeçalho quando header_format = LOCATION: {latitude, longitude, name, address}. A Meta exige esses valores em todo disparo.';
COMMENT ON COLUMN public.message_templates.button_coupon_code IS
    'Código fixo do botão "Copiar código". A Meta exige o parâmetro coupon_code em todo disparo de template com botão COPY_CODE.';
