-- ============================================
-- RPC: register_fcm_token
-- Permite que qualquer membro autenticado registre seu próprio token FCM
-- sem depender de RLS policies da tabela team_members.
-- SECURITY DEFINER bypassa RLS — a função valida internamente
-- que o usuário só pode atualizar seu próprio registro.
-- ============================================

CREATE OR REPLACE FUNCTION public.register_fcm_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_row_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.team_members
  SET
    fcm_device_token = p_token,
    expo_push_token = NULL,
    updated_at = now()
  WHERE auth_user_id = v_user_id
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_team_member_found');
  END IF;

  RETURN json_build_object('success', true, 'team_member_id', v_row_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION public.register_fcm_token(TEXT) TO authenticated;
