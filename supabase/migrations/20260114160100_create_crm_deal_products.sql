-- =============================================
-- Migration: Criar tabela crm_deal_products
-- Relacionamento N:N entre deals e produtos
-- =============================================

-- 1. Criar tabela de produtos por negociação
CREATE TABLE IF NOT EXISTS crm_deal_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
    product_service_id UUID NOT NULL REFERENCES products_services(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Evitar duplicatas do mesmo produto no mesmo deal
    UNIQUE(deal_id, product_service_id)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_deal_products_deal ON crm_deal_products(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_products_product ON crm_deal_products(product_service_id);

-- 3. RLS
ALTER TABLE crm_deal_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_deal_products_access" ON crm_deal_products;
CREATE POLICY "crm_deal_products_access" ON crm_deal_products
FOR ALL USING (
    deal_id IN (
        SELECT id FROM crm_deals 
        WHERE user_id IN (
            SELECT tm.user_id FROM team_members tm 
            WHERE tm.user_id = auth.uid() 
               OR tm.auth_user_id = auth.uid()
        )
    )
);

-- 4. Permissões
GRANT ALL ON crm_deal_products TO authenticated;
GRANT ALL ON crm_deal_products TO service_role;

-- 5. Comentários
COMMENT ON TABLE crm_deal_products IS 'Relacionamento entre negociações (deals) e produtos/serviços';
COMMENT ON COLUMN crm_deal_products.deal_id IS 'ID da negociação';
COMMENT ON COLUMN crm_deal_products.product_service_id IS 'ID do produto ou serviço';
COMMENT ON COLUMN crm_deal_products.quantity IS 'Quantidade do item';
COMMENT ON COLUMN crm_deal_products.unit_price IS 'Preço unitário no momento da negociação';
