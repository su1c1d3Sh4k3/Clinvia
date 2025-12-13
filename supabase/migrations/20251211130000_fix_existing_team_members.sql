-- =============================================
-- Migration: Corrigir user_id de membros existentes
-- Criado em: 2025-12-11
-- =============================================

-- 1. PRIMEIRO: Remover constraint UNIQUE do user_id
-- Agora múltiplos membros podem compartilhar o mesmo user_id (owner)
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_user_id_key;

-- 2. Atualizar todos os team_members que NÃO são admin
-- para usar o user_id do admin (3e21175c-b183-4041-b375-eacb292e8d41)
UPDATE public.team_members 
SET 
    auth_user_id = user_id,  -- Guardar o user_id atual como auth_user_id
    user_id = '3e21175c-b183-4041-b375-eacb292e8d41'  -- Definir user_id como o admin
WHERE role != 'admin' 
AND user_id != '3e21175c-b183-4041-b375-eacb292e8d41';

-- 3. Garantir que o admin também tenha auth_user_id preenchido
UPDATE public.team_members 
SET auth_user_id = user_id
WHERE role = 'admin' AND auth_user_id IS NULL;

-- 4. Criar índice para otimizar buscas por user_id (owner)
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
