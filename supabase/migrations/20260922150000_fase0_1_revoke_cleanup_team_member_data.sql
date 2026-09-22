-- ============================================================================
-- FASE 0.1 — contencao do achado #0 da auditoria de RLS (2026-09-22)
--
-- public.cleanup_team_member_data(target_user_id uuid) e SECURITY DEFINER e
-- executa, sem NENHUMA checagem de quem chama:
--     UPDATE public.conversations SET assigned_agent_id = NULL WHERE assigned_agent_id = target_user_id;
--     DELETE FROM public.team_members WHERE auth_user_id = target_user_id;
--     DELETE FROM public.profiles     WHERE id = target_user_id;
-- O EXECUTE estava concedido a PUBLIC, anon e authenticated => qualquer pessoa
-- com a anon key do bundle podia apagar a conta de qualquer cliente, sem login.
--
-- MAPA DE USO (regra (a)): o unico chamador em todo o repo e a edge function
-- supabase/functions/delete-team-member/index.ts, que usa supabaseAdmin
-- (service key). Nenhum arquivo em src/ chama esta RPC. service_role e postgres
-- mantem o EXECUTE, portanto a exclusao de colaborador pelo painel continua
-- funcionando exatamente como hoje.
--
-- ROLLBACK: supabase/rollback/20260922150000_..._rollback.sql
-- ============================================================================

revoke execute on function public.cleanup_team_member_data(uuid) from public;
revoke execute on function public.cleanup_team_member_data(uuid) from anon;
revoke execute on function public.cleanup_team_member_data(uuid) from authenticated;

-- garantia explicita de que o caminho legitimo continua aberto
grant execute on function public.cleanup_team_member_data(uuid) to service_role;
