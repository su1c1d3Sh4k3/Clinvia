-- =====================================================
-- Integridade: NOT NULL em colunas obrigatórias
-- =====================================================
-- Essas colunas sempre são preenchidas pela aplicação, mas faltava
-- a garantia no nível do banco. Adicionamos a constraint com segurança:
-- se existirem NULLs, a migration falha em vez de silenciar o problema.
-- =====================================================

-- Categorias financeiras sempre pertencem a um usuário
ALTER TABLE revenue_categories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE expense_categories ALTER COLUMN user_id SET NOT NULL;

-- Produtos/serviços sempre pertencem a um usuário
ALTER TABLE products_services ALTER COLUMN user_id SET NOT NULL;

-- =====================================================
-- Integridade: UNIQUE em contacts por instância
-- =====================================================
-- NOTA: Já coberto por idx_contacts_unique_per_instance (UNIQUE parcial em
-- (instance_id, number) WHERE instance_id IS NOT NULL), criado em
-- 20251216_fix_contacts_constraint.sql. Nenhuma ação necessária aqui.
-- =====================================================
