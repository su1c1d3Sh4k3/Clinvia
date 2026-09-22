-- ROLLBACK da migration 20260922151000 (Fase 0, lote 1).
-- Restaura literalmente o estado capturado por supabase/.temp/_f0_pre.sql:
--   groups / group_members:
--     "Enable read access for all users" SELECT public  USING true
--     "Enable update for authenticated"  UPDATE authenticated USING true
--     "Enable insert for authenticated"  INSERT authenticated CHECK true
--   appointment_confirmation_sessions:
--     acs_service_role ALL public USING true CHECK true
--   response_times:
--     "Authenticated users can view response_times" SELECT authenticated USING true
--     "System can manage response_times"            ALL    authenticated USING true CHECK true
-- ATENCAO: aplicar isto reabre os achados #4, #2 e #7.

begin;

drop policy if exists groups_tenant_select on public.groups;
drop policy if exists groups_tenant_insert on public.groups;
drop policy if exists groups_tenant_update on public.groups;
create policy "Enable read access for all users" on public.groups for select using (true);
create policy "Enable update for authenticated"  on public.groups for update to authenticated using (true);
create policy "Enable insert for authenticated"  on public.groups for insert to authenticated with check (true);

drop policy if exists group_members_tenant_select on public.group_members;
drop policy if exists group_members_tenant_insert on public.group_members;
drop policy if exists group_members_tenant_update on public.group_members;
create policy "Enable read access for all users" on public.group_members for select using (true);
create policy "Enable update for authenticated"  on public.group_members for update to authenticated using (true);
create policy "Enable insert for authenticated"  on public.group_members for insert to authenticated with check (true);

drop policy if exists acs_tenant_select on public.appointment_confirmation_sessions;
create policy acs_service_role on public.appointment_confirmation_sessions
  for all using (true) with check (true);

create policy "Authenticated users can view response_times" on public.response_times
  for select to authenticated using (true);
create policy "System can manage response_times" on public.response_times
  for all to authenticated using (true) with check (true);

commit;
