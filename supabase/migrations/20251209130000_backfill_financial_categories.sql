-- =============================================
-- Backfill categorias padrão para usuários existentes
-- =============================================

-- Inserir categorias de receita para usuários que ainda não têm
INSERT INTO revenue_categories (user_id, name, description)
SELECT p.id, cat.name, cat.description
FROM profiles p
CROSS JOIN (
    VALUES 
        ('Serviços', 'Receitas de serviços prestados'),
        ('Produtos', 'Receitas de vendas de produtos'),
        ('Comissões', 'Receitas de comissões'),
        ('Agendamentos', 'Receitas de agendamentos'),
        ('Outros', 'Outras receitas')
) AS cat(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM revenue_categories rc 
    WHERE rc.user_id = p.id AND rc.name = cat.name
);

-- Inserir categorias de despesa para usuários que ainda não têm
INSERT INTO expense_categories (user_id, name, description)
SELECT p.id, cat.name, cat.description
FROM profiles p
CROSS JOIN (
    VALUES 
        ('Infraestrutura', 'Despesas com servidores, cloud, etc'),
        ('Aluguel', 'Despesas com aluguel de escritório'),
        ('Software', 'Despesas com licenças de software'),
        ('Utilidades', 'Internet, telefone, energia, etc'),
        ('Marketing', 'Despesas com marketing e publicidade'),
        ('Material', 'Material de escritório e suprimentos'),
        ('Outros', 'Outras despesas')
) AS cat(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM expense_categories ec 
    WHERE ec.user_id = p.id AND ec.name = cat.name
);
