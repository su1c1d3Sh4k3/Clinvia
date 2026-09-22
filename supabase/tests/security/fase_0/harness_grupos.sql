-- ================================================================
-- ARNES DE TESTE (antes/depois dentro de UMA transacao, terminando em ROLLBACK)
-- Nada e persistido. Prova, com dados de producao reais, que a policy candidata:
--   (a) devolve EXATAMENTE as mesmas linhas para o proprio tenant, e
--   (b) zera o que hoje vaza de outro tenant.
-- Persona A = PELE DERMATOLOGIA  e697878e-29c9-4b7e-88bb-869f4f2c76af
-- Persona B = Clinica Auto Estima 06dfdd91-9fcd-4737-aa5b-08df0549f77a
-- ================================================================
begin;

create temp table _res(ord serial, etapa text, cenario text, valor text);
-- o arnes troca de role; o coletor precisa ser gravavel por todos eles
grant all on _res to authenticated, anon, service_role;
grant all on sequence _res_ord_seq to authenticated, anon, service_role;

-- ---------- ANTES ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';
insert into _res(etapa,cenario,valor)
select 'ANTES','A ve grupos do proprio tenant', count(*)::text from public.groups where user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'ANTES','A ve grupos de OUTROS tenants', count(*)::text from public.groups where user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'ANTES','A ve membros de grupo de OUTROS', count(*)::text
from public.group_members gm join public.groups g on g.id=gm.group_id
where g.user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'ANTES','A ve sessoes de confirmacao de OUTROS', count(*)::text
from public.appointment_confirmation_sessions where user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'ANTES','A ve response_times (global)', count(*)::text from public.response_times;
reset role;

-- ---------- DDL CANDIDATA ----------
drop policy if exists "Enable read access for all users" on public.groups;
drop policy if exists "Enable update for authenticated" on public.groups;
drop policy if exists "Enable insert for authenticated" on public.groups;
create policy groups_tenant_select on public.groups for select to authenticated
  using (user_id = public.get_owner_id());
create policy groups_tenant_insert on public.groups for insert to authenticated
  with check (user_id = public.get_owner_id());
create policy groups_tenant_update on public.groups for update to authenticated
  using (user_id = public.get_owner_id()) with check (user_id = public.get_owner_id());

drop policy if exists "Enable read access for all users" on public.group_members;
drop policy if exists "Enable update for authenticated" on public.group_members;
drop policy if exists "Enable insert for authenticated" on public.group_members;
create policy group_members_tenant_select on public.group_members for select to authenticated
  using (exists (select 1 from public.groups g where g.id = group_members.group_id
                   and g.user_id = public.get_owner_id()));
create policy group_members_tenant_insert on public.group_members for insert to authenticated
  with check (exists (select 1 from public.groups g where g.id = group_members.group_id
                   and g.user_id = public.get_owner_id()));
create policy group_members_tenant_update on public.group_members for update to authenticated
  using (exists (select 1 from public.groups g where g.id = group_members.group_id
                   and g.user_id = public.get_owner_id()));

drop policy if exists acs_service_role on public.appointment_confirmation_sessions;
create policy acs_tenant_select on public.appointment_confirmation_sessions for select to authenticated
  using (user_id = public.get_owner_id());

drop policy if exists "System can manage response_times" on public.response_times;
drop policy if exists "Authenticated users can view response_times" on public.response_times;

-- ---------- DEPOIS ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve grupos do proprio tenant', count(*)::text from public.groups where user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve grupos de OUTROS tenants', count(*)::text from public.groups where user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve membros do proprio tenant', count(*)::text
from public.group_members gm join public.groups g on g.id=gm.group_id
where g.user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve membros de grupo de OUTROS', count(*)::text
from public.group_members gm join public.groups g on g.id=gm.group_id
where g.user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve sessoes do proprio tenant', count(*)::text
from public.appointment_confirmation_sessions where user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve sessoes de confirmacao de OUTROS', count(*)::text
from public.appointment_confirmation_sessions where user_id<>'e697878e-29c9-4b7e-88bb-869f4f2c76af';
insert into _res(etapa,cenario,valor)
select 'DEPOIS','A ve response_times (global)', count(*)::text from public.response_times;
reset role;

-- ---------- CONTROLE: service_role (edge functions / cron / n8n) ----------
set local role service_role;
insert into _res(etapa,cenario,valor)
select 'DEPOIS/service_role','le TODOS os grupos (edge fn nao e afetada)', count(*)::text from public.groups;
insert into _res(etapa,cenario,valor)
select 'DEPOIS/service_role','le TODAS as sessoes de confirmacao', count(*)::text from public.appointment_confirmation_sessions;
insert into _res(etapa,cenario,valor)
select 'DEPOIS/service_role','le TODOS os response_times', count(*)::text from public.response_times;
reset role;

-- ---------- CONTROLE: anon (chave publica do bundle) ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res(etapa,cenario,valor)
select 'DEPOIS/anon','le grupos', count(*)::text from public.groups;
insert into _res(etapa,cenario,valor)
select 'DEPOIS/anon','le membros de grupo', count(*)::text from public.group_members;
insert into _res(etapa,cenario,valor)
select 'DEPOIS/anon','le sessoes de confirmacao', count(*)::text from public.appointment_confirmation_sessions;
reset role;

select etapa || '  ::  ' || cenario || '  =  ' || valor as resultado from _res order by ord;

rollback;
