-- =============================================
-- Migration: Adicionar contact_id e status pending em sales
-- =============================================

-- 1. Adicionar coluna contact_id
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

-- 2. Criar índice para contact_id
CREATE INDEX IF NOT EXISTS idx_sales_contact_id ON public.sales(contact_id);

-- 3. Atualizar constraint de payment_type para incluir 'pending'
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_type_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_type_check 
    CHECK (payment_type IN ('cash', 'installment', 'pending'));

-- 4. Comentário
COMMENT ON COLUMN public.sales.contact_id IS 'Cliente vinculado à venda (da tabela contacts)';
COMMENT ON CONSTRAINT sales_payment_type_check ON public.sales IS 'Tipos de pagamento: cash (à vista), installment (parcelado), pending (pendente)';
