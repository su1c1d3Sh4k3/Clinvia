-- =============================================
-- SEED: Dados de Teste para Módulo de Vendas
-- User ID: 3e21175c-b183-4041-b375-eacb292e8d41
-- =============================================

-- =============================================
-- 1. PRODUTOS E SERVIÇOS DE TESTE
-- =============================================

INSERT INTO products_services (id, user_id, type, name, description, price, stock_quantity, duration_minutes)
VALUES
    -- Produtos
    ('a1111111-1111-1111-1111-111111111111', '3e21175c-b183-4041-b375-eacb292e8d41', 'product', 'Creme Hidratante Facial', 'Creme hidratante para pele sensível', 89.90, 50, NULL),
    ('a2222222-2222-2222-2222-222222222222', '3e21175c-b183-4041-b375-eacb292e8d41', 'product', 'Sérum Vitamina C', 'Sérum antioxidante concentrado', 159.90, 30, NULL),
    ('a3333333-3333-3333-3333-333333333333', '3e21175c-b183-4041-b375-eacb292e8d41', 'product', 'Protetor Solar FPS 50', 'Protetor solar facial oil-free', 69.90, 100, NULL),
    ('a4444444-4444-4444-4444-444444444444', '3e21175c-b183-4041-b375-eacb292e8d41', 'product', 'Kit Anti-Idade', 'Conjunto completo anti-envelhecimento', 450.00, 20, NULL),
    -- Serviços
    ('b1111111-1111-1111-1111-111111111111', '3e21175c-b183-4041-b375-eacb292e8d41', 'service', 'Limpeza de Pele', 'Limpeza profunda facial completa', 180.00, NULL, 60),
    ('b2222222-2222-2222-2222-222222222222', '3e21175c-b183-4041-b375-eacb292e8d41', 'service', 'Peeling Químico', 'Tratamento de renovação celular', 350.00, NULL, 45),
    ('b3333333-3333-3333-3333-333333333333', '3e21175c-b183-4041-b375-eacb292e8d41', 'service', 'Microagulhamento', 'Tratamento para rejuvenescimento', 550.00, NULL, 90),
    ('b4444444-4444-4444-4444-444444444444', '3e21175c-b183-4041-b375-eacb292e8d41', 'service', 'Botox Facial', 'Aplicação de toxina botulínica', 1200.00, NULL, 30)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. PROFISSIONAIS DE TESTE
-- =============================================

INSERT INTO professionals (id, user_id, name, role, work_days, photo_url)
VALUES
    ('c1111111-1111-1111-1111-111111111111', '3e21175c-b183-4041-b375-eacb292e8d41', 'Dra. Ana Paula Silva', 'Dermatologista', ARRAY[1,2,3,4,5], NULL),
    ('c2222222-2222-2222-2222-222222222222', '3e21175c-b183-4041-b375-eacb292e8d41', 'Dr. Carlos Mendes', 'Esteticista', ARRAY[1,2,3,4,5,6], NULL),
    ('c3333333-3333-3333-3333-333333333333', '3e21175c-b183-4041-b375-eacb292e8d41', 'Dra. Fernanda Costa', 'Cirurgiã Plástica', ARRAY[2,4], NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 3. TEAM MEMBERS DE TESTE (se necessário atualizar existentes)
-- Nota: team_members requer auth_user_id válido, então apenas adicionamos se não existir
-- =============================================

-- Verificar se já existe algum team_member para o user_id
DO $$
DECLARE
    v_admin_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM team_members 
        WHERE user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
    ) INTO v_admin_exists;
    
    -- Se não tiver team member, inserir o admin principal
    IF NOT v_admin_exists THEN
        INSERT INTO team_members (id, user_id, name, email, role)
        VALUES (
            'd1111111-1111-1111-1111-111111111111',
            '3e21175c-b183-4041-b375-eacb292e8d41', 
            'Admin Principal', 
            'admin@clinvia.ai', 
            'admin'
        );
    END IF;
END $$;

-- =============================================
-- 4. VENDAS DE TESTE (10 vendas)
-- =============================================

-- Primeiro obter o ID de um team_member existente para este user
DO $$
DECLARE
    v_team_member_id UUID;
BEGIN
    SELECT id INTO v_team_member_id 
    FROM team_members 
    WHERE user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
    LIMIT 1;

    -- Se não encontrar, usar NULL
    IF v_team_member_id IS NULL THEN
        v_team_member_id := NULL;
    END IF;

    -- =============================================
    -- Vendas à Vista (6 vendas)
    -- =============================================

    -- Venda 1: Produto à vista - Creme Hidratante
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e1111111-1111-1111-1111-111111111111',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a1111111-1111-1111-1111-111111111111',
        2,
        89.90,
        179.80,
        'cash',
        1,
        0,
        '2026-01-05',
        v_team_member_id,
        NULL
    );

    -- Venda 2: Serviço à vista - Limpeza de Pele
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e2222222-2222-2222-2222-222222222222',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'service',
        'b1111111-1111-1111-1111-111111111111',
        1,
        180.00,
        180.00,
        'cash',
        1,
        0,
        '2026-01-08',
        v_team_member_id,
        'c1111111-1111-1111-1111-111111111111'
    );

    -- Venda 3: Produto à vista - Sérum Vitamina C
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e3333333-3333-3333-3333-333333333333',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a2222222-2222-2222-2222-222222222222',
        3,
        159.90,
        479.70,
        'cash',
        1,
        0,
        '2026-01-10',
        v_team_member_id,
        NULL
    );

    -- Venda 4: Serviço à vista - Peeling Químico
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e4444444-4444-4444-4444-444444444444',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'service',
        'b2222222-2222-2222-2222-222222222222',
        1,
        350.00,
        350.00,
        'cash',
        1,
        0,
        '2026-01-12',
        NULL,
        'c2222222-2222-2222-2222-222222222222'
    );

    -- Venda 5: Produto à vista - Protetor Solar (múltiplas unidades)
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e5555555-5555-5555-5555-555555555555',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a3333333-3333-3333-3333-333333333333',
        5,
        69.90,
        349.50,
        'cash',
        1,
        0,
        '2026-01-03',
        v_team_member_id,
        NULL
    );

    -- Venda 6: Produto à vista - Kit Anti-Idade
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e6666666-6666-6666-6666-666666666666',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a4444444-4444-4444-4444-444444444444',
        1,
        450.00,
        450.00,
        'cash',
        1,
        0,
        '2026-01-07',
        v_team_member_id,
        'c3333333-3333-3333-3333-333333333333'
    );

    -- =============================================
    -- Vendas Parceladas SEM Juros (2 vendas)
    -- =============================================

    -- Venda 7: Serviço parcelado 3x SEM juros - Microagulhamento
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e7777777-7777-7777-7777-777777777777',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'service',
        'b3333333-3333-3333-3333-333333333333',
        1,
        550.00,
        550.00,
        'installment',
        3,
        0,
        '2026-01-06',
        v_team_member_id,
        'c1111111-1111-1111-1111-111111111111'
    );

    -- Venda 8: Produto parcelado 4x SEM juros - Kit Anti-Idade + Sérum
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e8888888-8888-8888-8888-888888888888',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a4444444-4444-4444-4444-444444444444',
        2,
        450.00,
        900.00,
        'installment',
        4,
        0,
        '2026-01-09',
        NULL,
        NULL
    );

    -- =============================================
    -- Vendas Parceladas COM Juros (2 vendas)
    -- =============================================

    -- Venda 9: Serviço parcelado 6x COM 2% juros - Botox Facial
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'e9999999-9999-9999-9999-999999999999',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'service',
        'b4444444-4444-4444-4444-444444444444',
        1,
        1200.00,
        1200.00,
        'installment',
        6,
        2.0,
        '2026-01-11',
        v_team_member_id,
        'c3333333-3333-3333-3333-333333333333'
    );

    -- Venda 10: Produto parcelado 12x COM 1.5% juros - Múltiplos Kits Anti-Idade
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id)
    VALUES (
        'eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '3e21175c-b183-4041-b375-eacb292e8d41',
        'product',
        'a4444444-4444-4444-4444-444444444444',
        4,
        450.00,
        1800.00,
        'installment',
        12,
        1.5,
        '2026-01-02',
        v_team_member_id,
        'c2222222-2222-2222-2222-222222222222'
    );

END $$;

-- =============================================
-- 5. RESUMO DOS DADOS INSERIDOS
-- =============================================
-- 
-- VENDAS À VISTA (6):
-- • Venda 1: 2x Creme Hidratante = R$ 179,80 (05/jan)
-- • Venda 2: 1x Limpeza de Pele = R$ 180,00 (08/jan) - Dra. Ana Paula
-- • Venda 3: 3x Sérum Vitamina C = R$ 479,70 (10/jan)
-- • Venda 4: 1x Peeling Químico = R$ 350,00 (12/jan) - Dr. Carlos
-- • Venda 5: 5x Protetor Solar = R$ 349,50 (03/jan)
-- • Venda 6: 1x Kit Anti-Idade = R$ 450,00 (07/jan) - Dra. Fernanda
--
-- VENDAS PARCELADAS SEM JUROS (2):
-- • Venda 7: 1x Microagulhamento = R$ 550,00 em 3x (06/jan) - Dra. Ana Paula
--   Parcelas: Jan R$ 183,33 | Fev R$ 183,33 | Mar R$ 183,34
-- • Venda 8: 2x Kit Anti-Idade = R$ 900,00 em 4x (09/jan)
--   Parcelas: Jan R$ 225,00 | Fev R$ 225,00 | Mar R$ 225,00 | Abr R$ 225,00
--
-- VENDAS PARCELADAS COM JUROS (2):
-- • Venda 9: 1x Botox Facial = R$ 1.200,00 em 6x com 2% a.m. (11/jan) - Dra. Fernanda
--   Parcelas com juros simples até Jun/2026
-- • Venda 10: 4x Kit Anti-Idade = R$ 1.800,00 em 12x com 1.5% a.m. (02/jan) - Dr. Carlos
--   Parcelas com juros simples até Jan/2027
--
-- TOTAL BRUTO: R$ 6.439,00
-- Total Vendas: 10
-- Produtos: 6 vendas | Serviços: 4 vendas
