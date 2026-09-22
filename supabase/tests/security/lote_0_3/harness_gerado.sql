-- ARNES do lote 0.3 (#3, #6, #11, #12): mede o acesso ANTES, aplica a
-- migration na MESMA transacao, mede DEPOIS e termina em ROLLBACK.
-- Nada toca producao.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon;
grant all on sequence _r_ord_seq to authenticated, anon;
grant all on _ids to authenticated, anon;

-- Personas: A = PELE (tenant grande, ativo), B = tenant de dev,
-- S = staff da plataforma (admin_users ativo) -- so ele deve ler llm_model_prices.
insert into _ids(k, v) values
  ('a', 'e697878e-29c9-4b7e-88bb-869f4f2c76af'),
  ('b', '3e21175c-b183-4041-b375-eacb292e8d41');

insert into _ids(k, v)
select 's', a.auth_user_id::text from public.admin_users a
where a.is_active and a.auth_user_id is not null limit 1;

insert into _r(info)
select 'setup | ' || k || ' = ' || coalesce(v, 'NULO') from _ids order by k;

-- Volume real por tabela, visto sem RLS (baseline do que ESTA la).
insert into _r(info)
select 'setup | linhas reais | backup=' || (select count(*) from public.contacts_merge_backup_20260901)::text
  || ' split_audit=' || (select count(*) from public.crm_client_channel_split_audit)::text
  || ' opportunities=' || (select count(*) from public.opportunities)::text
  || ' notifications=' || (select count(*) from public.notifications)::text
  || ' dados_atendimento=' || (select count(*) from public.dados_atendimento)::text
  || ' llm_model_prices=' || (select count(*) from public.llm_model_prices)::text
  || ' team_costs=' || (select count(*) from public.team_costs)::text
  || ' _reminder_log=' || (select count(*) from public._reminder_log)::text;

reset role;

-- As duas tabelas de backup mudam de schema no meio da transacao; resolver o
-- nome aqui (como superuser) e usar dynamic SQL depois evita erro de parse e
-- deixa o "permission denied for schema private" aparecer como resultado.
delete from _ids where k in ('rel_backup', 'rel_audit');
insert into _ids(k, v) values
  ('rel_backup', coalesce(to_regclass('public.contacts_merge_backup_20260901')::text,
                          to_regclass('private.contacts_merge_backup_20260901')::text, 'sumiu')),
  ('rel_audit',  coalesce(to_regclass('public.crm_client_channel_split_audit')::text,
                          to_regclass('private.crm_client_channel_split_audit')::text, 'sumiu'));

insert into _r(info)
select 'ANTES | nome da tabela | ' || k || ' = ' || v from _ids
where k in ('rel_backup', 'rel_audit');

insert into _r(info)
select 'ANTES | policies | ' || rpad(tablename, 20) || ' = ' || count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename in ('team_costs', 'opportunities', 'notifications',
                    'dados_atendimento', 'llm_model_prices', '_reminder_log')
group by tablename order by tablename;

insert into _r(info)
select 'ANTES | rls ligada | ' || rpad(c.relname, 34) || ' = ' || c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('_reminder_log', 'contacts_merge_backup_20260901',
                    'crm_client_channel_split_audit')
  and n.nspname in ('public', 'private');

-- ===========================================================================
-- anon (chave publica do bundle, sem login)
-- ===========================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('ANTES | anon le backup de contatos | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('ANTES | anon le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('ANTES | anon le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le _reminder_log | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('ANTES | anon le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('ANTES | anon le opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('ANTES | anon le notifications | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le notifications | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('ANTES | anon le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | anon le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_ANTES_anon',
            (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('ANTES | anon forja notificacao na conta de A | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | anon forja notificacao na conta de A | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant A (PELE, dono/admin da propria conta)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('ANTES | A le backup de contatos (137 sao de outro tenant) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('ANTES | A le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('ANTES | A le opportunities (as 15 sao de B) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A altera opportunities de B | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A altera opportunities de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('ANTES | A le precos de LLM (custo do provedor) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('ANTES | A le as proprias notificacoes | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_ANTES_a_em_b', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('ANTES | A forja notificacao na conta de B | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | A forja notificacao na conta de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_ANTES_a_ok', (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('ANTES | A cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | A cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('ANTES | A le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.dados_atendimento;
    insert into _r(info) values ('ANTES | A le dados_atendimento (tabela vazia) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le dados_atendimento | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('ANTES | A le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A le _reminder_log | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant B (dev) -- dono das 15 opportunities: NAO pode perder o que e dele
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"3e21175c-b183-4041-b375-eacb292e8d41","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('ANTES | B le as proprias opportunities (15) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | B le as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | B altera as proprias opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | B altera as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('ANTES | B le as proprias notificacoes (350) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | B le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_ANTES_b_ok', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('ANTES | B cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | B cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('ANTES | B le auditoria do split de A (177) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | B le auditoria do split de A | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('ANTES | B le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | B le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Staff da plataforma (admin_users ativo): e o unico que deve ver o custo do
-- provedor depois do lote.
-- ===========================================================================
do $harness$
declare n bigint; sid text;
begin
  sid := (select v from _ids where k='s');
  if sid is null then
    insert into _r(info) values ('ANTES | S staff | SEM admin_users ativo, teste pulado');
    return;
  end if;
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', sid, 'role', 'authenticated')::text);
  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('ANTES | S (staff) le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | S (staff) le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;
insert into _r(info) select 'tempo | ANTES fim | ' || to_char(clock_timestamp(), 'HH24:MI:SS.MS');


reset role;
-- ===== APPLY DA MIGRATION (na mesma transacao) =====
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

-- DDL em tabela com tráfego pega ACCESS EXCLUSIVE; melhor falhar rápido do que
-- pendurar a transação (e o gateway) esperando o lock.


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

reset role;

-- As duas tabelas de backup mudam de schema no meio da transacao; resolver o
-- nome aqui (como superuser) e usar dynamic SQL depois evita erro de parse e
-- deixa o "permission denied for schema private" aparecer como resultado.
delete from _ids where k in ('rel_backup', 'rel_audit');
insert into _ids(k, v) values
  ('rel_backup', coalesce(to_regclass('public.contacts_merge_backup_20260901')::text,
                          to_regclass('private.contacts_merge_backup_20260901')::text, 'sumiu')),
  ('rel_audit',  coalesce(to_regclass('public.crm_client_channel_split_audit')::text,
                          to_regclass('private.crm_client_channel_split_audit')::text, 'sumiu'));

insert into _r(info)
select 'DEPOIS | nome da tabela | ' || k || ' = ' || v from _ids
where k in ('rel_backup', 'rel_audit');

insert into _r(info)
select 'DEPOIS | policies | ' || rpad(tablename, 20) || ' = ' || count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename in ('team_costs', 'opportunities', 'notifications',
                    'dados_atendimento', 'llm_model_prices', '_reminder_log')
group by tablename order by tablename;

insert into _r(info)
select 'DEPOIS | rls ligada | ' || rpad(c.relname, 34) || ' = ' || c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('_reminder_log', 'contacts_merge_backup_20260901',
                    'crm_client_channel_split_audit')
  and n.nspname in ('public', 'private');

-- ===========================================================================
-- anon (chave publica do bundle, sem login)
-- ===========================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('DEPOIS | anon le backup de contatos | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('DEPOIS | anon le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('DEPOIS | anon le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le _reminder_log | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('DEPOIS | anon le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('DEPOIS | anon le opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('DEPOIS | anon le notifications | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le notifications | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('DEPOIS | anon le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | anon le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_DEPOIS_anon',
            (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('DEPOIS | anon forja notificacao na conta de A | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | anon forja notificacao na conta de A | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant A (PELE, dono/admin da propria conta)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('DEPOIS | A le backup de contatos (137 sao de outro tenant) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('DEPOIS | A le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('DEPOIS | A le opportunities (as 15 sao de B) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('DEPOIS | A altera opportunities de B | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A altera opportunities de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('DEPOIS | A le precos de LLM (custo do provedor) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('DEPOIS | A le as proprias notificacoes | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_DEPOIS_a_em_b', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('DEPOIS | A forja notificacao na conta de B | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A forja notificacao na conta de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_DEPOIS_a_ok', (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('DEPOIS | A cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('DEPOIS | A le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.dados_atendimento;
    insert into _r(info) values ('DEPOIS | A le dados_atendimento (tabela vazia) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le dados_atendimento | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('DEPOIS | A le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A le _reminder_log | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant B (dev) -- dono das 15 opportunities: NAO pode perder o que e dele
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"3e21175c-b183-4041-b375-eacb292e8d41","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('DEPOIS | B le as proprias opportunities (15) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | B le as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('DEPOIS | B altera as proprias opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | B altera as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('DEPOIS | B le as proprias notificacoes (350) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | B le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_DEPOIS_b_ok', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('DEPOIS | B cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | B cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('DEPOIS | B le auditoria do split de A (177) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | B le auditoria do split de A | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('DEPOIS | B le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | B le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Staff da plataforma (admin_users ativo): e o unico que deve ver o custo do
-- provedor depois do lote.
-- ===========================================================================
do $harness$
declare n bigint; sid text;
begin
  sid := (select v from _ids where k='s');
  if sid is null then
    insert into _r(info) values ('DEPOIS | S staff | SEM admin_users ativo, teste pulado');
    return;
  end if;
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', sid, 'role', 'authenticated')::text);
  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('DEPOIS | S (staff) le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | S (staff) le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;
insert into _r(info) select 'tempo | DEPOIS fim | ' || to_char(clock_timestamp(), 'HH24:MI:SS.MS');

reset role;
select info from _r order by ord;

rollback;
