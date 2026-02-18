-- =============================================
-- Update Default Queues to System Queues
-- Date: 2026-02-18
-- =============================================

UPDATE public.queues
SET is_system = true
WHERE name IN (
  'Atendimento IA',
  'Atendimento Humano',
  'Cliente Ativo',
  'Delivery',
  'Pós Venda',
  'Suporte',
  'Financeiro'
);
