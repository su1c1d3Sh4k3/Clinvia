-- Rollback de 20260922210000_lote_0_3_rls.sql
-- Recria EXATAMENTE o estado capturado por supabase/.temp/_l03_probe.sql antes
-- do apply (inclusive as policies abertas — este script devolve as brechas,
-- use só se o lote quebrar produção).
begin;

set local lock_timeout = '5s';

-- ============================================================
-- #3 e #6 — volta as tabelas para public, com os grants de antes
-- ============================================================
alter table if exists private.contacts_merge_backup_20260901 set schema public;
alter table if exists private.crm_client_channel_split_audit set schema public;

alter table public.contacts_merge_backup_20260901 disable row level security;
alter table public.crm_client_channel_split_audit disable row level security;

grant delete, insert, references, select, trigger, truncate, update
  on table public.contacts_merge_backup_20260901
  to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update
  on table public.crm_client_channel_split_audit
  to anon, authenticated, service_role;

-- O schema `private` fica: dropá-lo não faz parte do rollback (outros lotes
-- podem já tê-lo usado). Vazio, ele é inerte e não é exposto pelo PostgREST.

-- ============================================================
-- #11 — team_costs
-- ============================================================
create policy "Staff can view all team costs" on public.team_costs
  for select to public
  using (public.is_staff());

-- ============================================================
-- #12 — menores
-- ============================================================
alter table public._reminder_log disable row level security;
grant delete, insert, references, select, trigger, truncate, update
  on table public._reminder_log
  to anon, authenticated, service_role;

drop policy if exists "opportunities_all" on public.opportunities;

create policy "Admins and Supervisors can view all opportunities" on public.opportunities
  for select to authenticated
  using (public.is_admin() or public.is_supervisor());

create policy "Agents can view assigned or unassigned opportunities" on public.opportunities
  for select to authenticated
  using (
    public.is_agent()
    and (assigned_to = auth.uid() or assigned_to is null or claimed_by = auth.uid())
  );

create policy "Service role can insert opportunities" on public.opportunities
  for insert to authenticated
  with check (public.is_admin());

create policy "Users can claim opportunities" on public.opportunities
  for update to authenticated
  using (
    public.is_admin() or public.is_supervisor()
    or (public.is_agent() and (assigned_to = auth.uid() or assigned_to is null))
  )
  with check (
    public.is_admin() or public.is_supervisor()
    or (public.is_agent() and (assigned_to = auth.uid() or assigned_to is null))
  );

drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (true);

drop policy if exists "dados_atendimento_all" on public.dados_atendimento;

create policy "Authenticated users can view all dados_atendimento" on public.dados_atendimento
  for select to authenticated
  using (true);

create policy "Authenticated users can create dados_atendimento" on public.dados_atendimento
  for insert to authenticated
  with check (true);

create policy "Authenticated users can update own dados_atendimento" on public.dados_atendimento
  for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "llm_model_prices_read" on public.llm_model_prices;

create policy "llm_model_prices_read" on public.llm_model_prices
  for select to authenticated
  using (true);

commit;
