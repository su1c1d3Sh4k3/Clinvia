-- =============================================
-- Migration: Adicionar campos de configurações em team_members
-- Criado em: 2025-12-11
-- =============================================

-- Adicionar campos que existem em profiles mas faltam em team_members
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS group_notifications_enabled BOOLEAN DEFAULT TRUE;

-- Copiar dados existentes de profiles para team_members (sincronizar)
UPDATE public.team_members tm
SET 
  full_name = COALESCE(tm.full_name, p.full_name),
  address = COALESCE(tm.address, p.address),
  instagram = COALESCE(tm.instagram, p.instagram),
  notifications_enabled = COALESCE(tm.notifications_enabled, p.notifications_enabled, TRUE),
  group_notifications_enabled = COALESCE(tm.group_notifications_enabled, p.group_notifications_enabled, TRUE)
FROM public.profiles p
WHERE tm.user_id = p.id;

-- Atualizar name para full_name se full_name estiver vazio
UPDATE public.team_members
SET full_name = name
WHERE full_name IS NULL OR full_name = '';

-- Comentários para documentação
COMMENT ON COLUMN public.team_members.full_name IS 'Nome completo do membro';
COMMENT ON COLUMN public.team_members.address IS 'Endereço do membro';
COMMENT ON COLUMN public.team_members.instagram IS 'Instagram do membro';
COMMENT ON COLUMN public.team_members.notifications_enabled IS 'Notificações de navegador habilitadas';
COMMENT ON COLUMN public.team_members.group_notifications_enabled IS 'Notificações de grupos habilitadas';
