-- =============================================
-- SEED: Inserir categorias padrão para todos os usuários existentes
-- =============================================

-- Inserir categorias de receita para todos os usuários
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM profiles LOOP
        -- Categorias de Receita
        INSERT INTO revenue_categories (user_id, name, description)
        VALUES 
            (user_record.id, 'Serviços', 'Receitas de serviços prestados'),
            (user_record.id, 'Produtos', 'Receitas de vendas de produtos'),
            (user_record.id, 'Comissões', 'Receitas de comissões'),
            (user_record.id, 'Agendamentos', 'Receitas de agendamentos'),
            (user_record.id, 'Outros', 'Outras receitas')
        ON CONFLICT DO NOTHING;
        
        -- Categorias de Despesa
        INSERT INTO expense_categories (user_id, name, description)
        VALUES 
            (user_record.id, 'Infraestrutura', 'Despesas com servidores, cloud, etc'),
            (user_record.id, 'Aluguel', 'Despesas com aluguel de escritório'),
            (user_record.id, 'Software', 'Despesas com licenças de software'),
            (user_record.id, 'Utilidades', 'Internet, telefone, energia, etc'),
            (user_record.id, 'Marketing', 'Despesas com marketing e publicidade'),
            (user_record.id, 'Material', 'Material de escritório e suprimentos'),
            (user_record.id, 'Outros', 'Outras despesas')
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
