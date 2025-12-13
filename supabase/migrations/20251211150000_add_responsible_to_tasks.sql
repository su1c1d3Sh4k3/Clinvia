-- Migration: Adicionar responsible_id na tabela tasks
-- Referencia team_members para compatibilidade com filtro por agente

-- 1. Adicionar coluna responsible_id
ALTER TABLE tasks
ADD COLUMN responsible_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- 2. Atualizar tasks existentes: atribuir ao team_member do criador
UPDATE tasks t
SET responsible_id = (
    SELECT tm.id 
    FROM team_members tm 
    WHERE tm.auth_user_id = t.user_id
    LIMIT 1
);

-- 3. Criar índice para performance em queries filtradas por responsible_id
CREATE INDEX idx_tasks_responsible_id ON tasks(responsible_id);
