-- ROLLBACK da migration 20260922150000 (Fase 0.1).
-- Restaura o estado exato capturado em supabase/.temp/_f0_pre.sql antes da aplicacao:
--   EXECUTE em cleanup_team_member_data(uuid) para PUBLIC, anon, authenticated,
--   postgres e service_role.
-- ATENCAO: aplicar isto reabre o achado #0 (qualquer um apaga qualquer conta).

grant execute on function public.cleanup_team_member_data(uuid) to public;
grant execute on function public.cleanup_team_member_data(uuid) to anon;
grant execute on function public.cleanup_team_member_data(uuid) to authenticated;
