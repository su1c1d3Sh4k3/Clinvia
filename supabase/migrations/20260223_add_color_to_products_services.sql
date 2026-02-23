-- Adiciona coluna color à tabela products_services
-- Permite associar uma cor a um serviço para exibição visual nos cards de agendamento

ALTER TABLE public.products_services
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL;
