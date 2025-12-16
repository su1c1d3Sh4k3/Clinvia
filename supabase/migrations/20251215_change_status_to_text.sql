-- =============================================
-- Alterar coluna status de ENUM para TEXT
-- Tabelas: revenues, expenses, team_costs
-- Data: 2025-12-15 22:20
-- =============================================

-- 1. REVENUES - Alterar status de financial_status para TEXT
ALTER TABLE public.revenues 
ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- 2. EXPENSES - Alterar status de financial_status para TEXT
ALTER TABLE public.expenses 
ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- 3. TEAM_COSTS - Alterar status de financial_status para TEXT
ALTER TABLE public.team_costs 
ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Opcional: Adicionar CHECK constraint para manter os valores válidos
-- ALTER TABLE public.revenues ADD CONSTRAINT revenues_status_check 
--     CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled'));
