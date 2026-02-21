-- Adicionar coluna para armazenar o funil destino da automação de novos contatos
ALTER TABLE public.instances
ADD COLUMN IF NOT EXISTS auto_create_deal_funnel_id UUID REFERENCES public.crm_funnels(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.instances.auto_create_deal_funnel_id IS 'Funil padrao para recptar novos contatos (leads) de mensagens recebidas nesta instancia, criando as negociacoes na primeira etapa.';
