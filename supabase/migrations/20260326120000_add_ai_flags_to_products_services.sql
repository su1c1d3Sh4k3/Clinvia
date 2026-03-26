-- Adiciona flags de controle de IA na tabela products_services
ALTER TABLE public.products_services
  ADD COLUMN IF NOT EXISTS available_for_ai BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_for_ai    BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products_services.available_for_ai IS 'Se verdadeiro, a IA pode oferecer/mencionar este item nas conversas';
COMMENT ON COLUMN public.products_services.visible_for_ai    IS 'Se verdadeiro, a IA consegue ver e consultar as informações deste item';
