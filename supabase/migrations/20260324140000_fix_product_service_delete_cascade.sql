-- =============================================
-- Migração: Corrige deleção de produtos/serviços
-- Data: 2026-03-24
-- Problema: FK crm_deal_products_product_service_id_fkey usava ON DELETE RESTRICT,
--           bloqueando a exclusão de qualquer produto/serviço referenciado em deals.
-- Solução: Trocar para ON DELETE CASCADE — ao excluir o produto, os itens de
--          deals que o referenciam são removidos automaticamente.
-- =============================================

ALTER TABLE public.crm_deal_products
    DROP CONSTRAINT crm_deal_products_product_service_id_fkey;

ALTER TABLE public.crm_deal_products
    ADD CONSTRAINT crm_deal_products_product_service_id_fkey
    FOREIGN KEY (product_service_id)
    REFERENCES public.products_services(id)
    ON DELETE CASCADE;
