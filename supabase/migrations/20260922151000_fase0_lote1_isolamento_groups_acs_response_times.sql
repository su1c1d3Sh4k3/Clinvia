-- ============================================================================
-- FASE 0 — LOTE 1: achados #4, #2 e #7 da auditoria de RLS (2026-09-22)
--
-- Todas as tabelas em public tem grant default para anon E authenticated, logo a
-- policy e o unico portao. As policies abaixo estavam com USING (true) e
-- roles = public / authenticated, ou seja: alcancaveis com a anon key que vai no
-- bundle do front, sem login.
--
--   #4 groups / group_members  -> SELECT true para public (4.219 telefones de
--                                 paciente de 8 contas) + UPDATE true
--   #2 appointment_confirmation_sessions -> acs_service_role era PERMISSIVE,
--                                 roles=public, cmd=ALL, USING true / CHECK true
--                                 (9.925 linhas com leitura, escrita e DELETE)
--   #7 response_times          -> ALL true para authenticated (155.141 linhas
--                                 deletaveis por qualquer usuario logado)
--
-- POR QUE NAO IMPACTA O QUE RODA HOJE
--   service_role e postgres tem rolbypassrls = true (verificado em pg_roles), e
--   as 139 tabelas e 233 funcoes SECURITY DEFINER sao do dono postgres. Toda
--   edge function, cron, webhook e API do n8n usa a service key => nenhuma
--   policy daqui as alcanca. As policies "Enable all for service_role" ficam
--   intactas por conservadorismo.
--
-- MAPA DE USO NO FRONT (regra (a)) — varredura de src/ em _front_surface.json
--   groups:        RestrictGroupModal.tsx:67 (SELECT), :98 (UPDATE),
--                  GroupInfoModal.tsx:53 (SELECT), useConversations.ts:54 (SELECT)
--   group_members: GroupInfoModal.tsx:54 (SELECT), useGroupMembers.ts:32 (SELECT *)
--   appointment_confirmation_sessions: ZERO uso no front
--   response_times:                    ZERO uso no front
--   Nenhum DELETE e nenhum INSERT do front nessas tabelas.
--   Nenhuma funcao/trigger do banco escreve nelas (verificado em _f0_writers.sql,
--   0 linhas) => nao existe caminho INVOKER que possa tomar 42501.
--
-- TESTE ANTES/DEPOIS (regra (b)) — supabase/.temp/_safe_d_harness_groups.sql,
-- transacao terminada em rollback, persona PELE e697878e-...:
--   proprio tenant   19 grupos -> 19 | 239 membros -> 239 | 9.684 sessoes mantidas
--   outros tenants  230 -> 0 | 3.980 -> 0 | 255 -> 0 | response_times 155.141 -> 0
--   service_role    249 / 9.939 / 155.141 (inalterado)
--   anon            0 / 0 / 0
--
-- ROLLBACK: supabase/rollback/20260922151000_..._rollback.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------- #4 groups
drop policy if exists "Enable read access for all users" on public.groups;
drop policy if exists "Enable update for authenticated"  on public.groups;
drop policy if exists "Enable insert for authenticated"  on public.groups;

create policy groups_tenant_select on public.groups
  for select to authenticated
  using (user_id = public.get_owner_id());

create policy groups_tenant_insert on public.groups
  for insert to authenticated
  with check (user_id = public.get_owner_id());

-- necessaria para RestrictGroupModal.tsx:98 (hidden_from_team_member_ids)
create policy groups_tenant_update on public.groups
  for update to authenticated
  using (user_id = public.get_owner_id())
  with check (user_id = public.get_owner_id());

-- --------------------------------------------------------- #4 group_members
drop policy if exists "Enable read access for all users" on public.group_members;
drop policy if exists "Enable update for authenticated"  on public.group_members;
drop policy if exists "Enable insert for authenticated"  on public.group_members;

create policy group_members_tenant_select on public.group_members
  for select to authenticated
  using (exists (select 1 from public.groups g
                  where g.id = group_members.group_id
                    and g.user_id = public.get_owner_id()));

create policy group_members_tenant_insert on public.group_members
  for insert to authenticated
  with check (exists (select 1 from public.groups g
                       where g.id = group_members.group_id
                         and g.user_id = public.get_owner_id()));

create policy group_members_tenant_update on public.group_members
  for update to authenticated
  using (exists (select 1 from public.groups g
                  where g.id = group_members.group_id
                    and g.user_id = public.get_owner_id()));

-- ------------------------------- #2 appointment_confirmation_sessions
-- o nome "acs_service_role" era enganoso: roles=public, ALL, true/true.
-- service_role nao precisa de policy (bypassrls).
drop policy if exists acs_service_role on public.appointment_confirmation_sessions;

create policy acs_tenant_select on public.appointment_confirmation_sessions
  for select to authenticated
  using (user_id = public.get_owner_id());

-- ------------------------------------------------------- #7 response_times
-- Tabela de metrica interna, escrita e lida somente por service_role. Fica com
-- RLS ligado e ZERO policy (padrao ja usado por outras 12 tabelas do schema):
-- invisivel para anon e authenticated, intacta para as edge functions.
drop policy if exists "System can manage response_times"        on public.response_times;
drop policy if exists "Authenticated users can view response_times" on public.response_times;

commit;
