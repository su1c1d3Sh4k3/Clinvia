-- =============================================
-- FIX DEFINITIVO: Corrigir função cleanup_team_member_data
-- Data: 2026-01-05
-- =============================================
-- PROBLEMA: A função antiga usava 'user_id' ao invés de 'auth_user_id',
-- causando deleção em massa de todos os membros da mesma equipe
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_team_member_data(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 1. Unassign tickets (set assigned_agent_id to NULL)
  -- Only for tickets currently assigned to this user
  UPDATE public.conversations
  SET assigned_agent_id = NULL
  WHERE assigned_agent_id = target_user_id;

  -- 2. Delete from team_members table
  -- ✅ CORRETO: Usa auth_user_id ao invés de user_id
  -- auth_user_id é único por membro, user_id é compartilhado pela equipe
  DELETE FROM public.team_members
  WHERE auth_user_id = target_user_id;

  -- 3. Delete from profiles (if exists)
  DELETE FROM public.profiles
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Função cleanup_team_member_data corrigida para usar auth_user_id';
END $$;
