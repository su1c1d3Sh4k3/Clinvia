-- ARNES POS-APLICACAO do lote 1 (#4, #2, #7). Le o estado REAL de producao e
-- simula as operacoes exatas que o front faz, inclusive o UPDATE do
-- RestrictGroupModal. Termina em ROLLBACK: o UPDATE de teste nao persiste.
-- Persona A = PELE DERMATOLOGIA e697878e-29c9-4b7e-88bb-869f4f2c76af
-- Persona B = Clinica Auto Estima 06dfdd91-9fcd-4737-aa5b-08df0549f77a
begin;

create temp table _r(ord serial, cenario text, valor text);
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;

-- guarda um group_id de cada tenant para os testes de UPDATE
create temp table _g(tenant text, gid uuid);
grant all on _g to authenticated, anon, service_role;
insert into _g select 'A', id from public.groups where user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af' limit 1;
insert into _g select 'B', id from public.groups where user_id='06dfdd91-9fcd-4737-aa5b-08df0549f77a' limit 1;

-- ================= PERSONA A (dono PELE) =================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

insert into _r(cenario,valor) select 'A le grupos (esperado 19)', count(*)::text from public.groups;
insert into _r(cenario,valor) select 'A le membros de grupo (esperado 239)', count(*)::text from public.group_members;
insert into _r(cenario,valor) select 'A le sessoes de confirmacao (esperado 9684)', count(*)::text from public.appointment_confirmation_sessions;
insert into _r(cenario,valor) select 'A le response_times (esperado 0)', count(*)::text from public.response_times;
insert into _r(cenario,valor) select 'A busca grupo por nome (useConversations.ts:54)', count(*)::text from public.groups where group_name ilike '%a%';
insert into _r(cenario,valor) select 'A le hidden_from_team_member_ids do proprio grupo (RestrictGroupModal:67)',
  count(*)::text from public.groups where id = (select gid from _g where tenant='A');
insert into _r(cenario,valor) select 'A le grupo do tenant B (esperado 0)',
  count(*)::text from public.groups where id = (select gid from _g where tenant='B');

-- UPDATE real do RestrictGroupModal:98, no proprio grupo e no grupo alheio
with u as (
  update public.groups set hidden_from_team_member_ids = hidden_from_team_member_ids
  where id = (select gid from _g where tenant='A') returning 1)
insert into _r(cenario,valor) select 'A faz UPDATE no PROPRIO grupo (esperado 1)', count(*)::text from u;
with u as (
  update public.groups set hidden_from_team_member_ids = hidden_from_team_member_ids
  where id = (select gid from _g where tenant='B') returning 1)
insert into _r(cenario,valor) select 'A faz UPDATE no grupo do tenant B (esperado 0)', count(*)::text from u;

-- tentativa de apagar metrica (achado #7)
with d as (delete from public.response_times where true returning 1)
insert into _r(cenario,valor) select 'A apaga response_times (esperado 0)', count(*)::text from d;
reset role;

-- ================= PERSONA B (outro tenant) =================
set local role authenticated;
set local request.jwt.claims = '{"sub":"06dfdd91-9fcd-4737-aa5b-08df0549f77a","role":"authenticated"}';
insert into _r(cenario,valor) select 'B le grupos (esperado 8, so os seus)', count(*)::text from public.groups;
insert into _r(cenario,valor) select 'B le grupo do tenant A (esperado 0)',
  count(*)::text from public.groups where id = (select gid from _g where tenant='A');
insert into _r(cenario,valor) select 'B le sessoes de confirmacao de A (esperado 0)', count(*)::text
  from public.appointment_confirmation_sessions where user_id='e697878e-29c9-4b7e-88bb-869f4f2c76af';
reset role;

-- ================= CONTROLE: service_role (edge fn / cron / n8n) =================
set local role service_role;
insert into _r(cenario,valor) select 'service_role le grupos (esperado 249)', count(*)::text from public.groups;
insert into _r(cenario,valor) select 'service_role le membros (esperado 4219)', count(*)::text from public.group_members;
insert into _r(cenario,valor) select 'service_role le sessoes (esperado 9939)', count(*)::text from public.appointment_confirmation_sessions;
insert into _r(cenario,valor) select 'service_role le response_times (esperado 155141+)', count(*)::text from public.response_times;
reset role;

-- ================= CONTROLE: anon (chave publica do bundle) =================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _r(cenario,valor) select 'anon le grupos (esperado 0)', count(*)::text from public.groups;
insert into _r(cenario,valor) select 'anon le membros (esperado 0)', count(*)::text from public.group_members;
insert into _r(cenario,valor) select 'anon le sessoes (esperado 0)', count(*)::text from public.appointment_confirmation_sessions;
insert into _r(cenario,valor) select 'anon le response_times (esperado 0)', count(*)::text from public.response_times;
reset role;

select cenario || '  =  ' || valor as resultado from _r order by ord;

rollback;
