-- Lote 0.3 do plano de segurança: itens #3, #6, #11 e #12 da auditoria
-- (docs/reports/2026-09-22_auditoria_rls_completa.md).
--
-- Mapa de dependências (varrido antes de escrever):
--   * contacts_merge_backup_20260901 (144 linhas) e crm_client_channel_split_audit
--     (177): NENHUMA função, view, FK ou trigger as referencia, e nada no front
--     ou nas edge functions as lê. Vão para o schema `private`, que não é
--     exposto pelo PostgREST.
--   * _reminder_log (0 linhas): só a edge function check-reminders escreve, com
--     SERVICE_ROLE_KEY (ignora RLS). Fica em `public` porque
--     admin_delete_tenant_data a varre pelo nome sem qualificar o schema.
--   * opportunities (15 linhas): o hook useOpportunities.ts é código morto
--     (nenhum componente o importa) e o trigger trg_auto_lead_opportunities é
--     SECURITY DEFINER. Ancorar em user_id não afeta ninguém.
--   * notifications (22.500 linhas): o front só LÊ (NavigationSidebar); todos os
--     inserts vêm de edge functions com service_role.
--   * dados_atendimento (0 linhas): sem uso no front/edge. get_global_metrics a
--     cita, mas a tabela está vazia.
--   * llm_model_prices (8 linhas): lida apenas por api-token-usage e
--     api-token-usage-sandbox, ambas com service_role.
--   * team_costs (0 linhas): nenhum uso no front.
--
-- Rollback: 20260922210000_lote_0_3_rls_rollback.sql
begin;

-- DDL em tabela com tráfego pega ACCESS EXCLUSIVE; melhor falhar rápido do que
-- pendurar a transação (e o gateway) esperando o lock.
set local lock_timeout = '5s';

-- ============================================================
-- #3 e #6 — backup/auditoria de migração fora da API
-- ============================================================
create schema if not exists private;
revoke all on schema private from anon, authenticated, public;
grant usage on schema private to service_role;

alter table if exists public.contacts_merge_backup_20260901 set schema private;
alter table if exists public.crm_client_channel_split_audit set schema private;

-- O `set schema` leva os grants junto: o REVOKE é o que realmente fecha a porta.
revoke all on table private.contacts_merge_backup_20260901 from anon, authenticated, public;
revoke all on table private.crm_client_channel_split_audit from anon, authenticated, public;

-- RLS sem policy = ninguém além de service_role/postgres (rolbypassrls).
alter table private.contacts_merge_backup_20260901 enable row level security;
alter table private.crm_client_channel_split_audit enable row level security;

-- ============================================================
-- #11 — team_costs: `is_staff()` é cego a tenant
-- ============================================================
-- `team_costs_all` (user_id = get_owner_id()) já cobre o uso legítimo.
drop policy if exists "Staff can view all team costs" on public.team_costs;

-- ============================================================
-- #12 — menores
-- ============================================================

-- _reminder_log: RLS desligada + grant para anon.
alter table public._reminder_log enable row level security;
revoke all on table public._reminder_log from anon, authenticated, public;

-- opportunities: as 4 policies eram cegas a tenant (is_admin()/is_agent() sem
-- user_id), então o admin de qualquer clínica lia e atualizava as linhas das
-- outras.
drop policy if exists "Admins and Supervisors can view all opportunities" on public.opportunities;
drop policy if exists "Agents can view assigned or unassigned opportunities" on public.opportunities;
drop policy if exists "Service role can insert opportunities" on public.opportunities;
drop policy if exists "Users can claim opportunities" on public.opportunities;

create policy "opportunities_all" on public.opportunities
  for all to authenticated
  using (user_id = public.get_owner_id())
  with check (user_id = public.get_owner_id());

-- notifications: o INSERT era `with check (true)` — dava para forjar
-- notificação em qualquer conta. O SELECT/DELETE já estavam ancorados.
drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (user_id = public.get_owner_id());

-- dados_atendimento: SELECT `using (true)` e INSERT `with check (true)`.
drop policy if exists "Authenticated users can view all dados_atendimento" on public.dados_atendimento;
drop policy if exists "Authenticated users can create dados_atendimento" on public.dados_atendimento;
drop policy if exists "Authenticated users can update own dados_atendimento" on public.dados_atendimento;

create policy "dados_atendimento_all" on public.dados_atendimento
  for all to authenticated
  using (user_id = public.get_owner_id())
  with check (user_id = public.get_owner_id());

-- llm_model_prices: o preço de custo do provedor é a base do nosso markup —
-- não é para o cliente ler. Quem calcula custo são as edge functions, com
-- service_role.
drop policy if exists "llm_model_prices_read" on public.llm_model_prices;

create policy "llm_model_prices_read" on public.llm_model_prices
  for select to authenticated
  using (public.is_admin_staff());

commit;
