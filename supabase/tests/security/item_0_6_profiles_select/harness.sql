-- ARNES do item 2 (leitura de profiles): hoje a policy de SELECT e
-- `using (true)` para authenticated, ou seja QUALQUER usuario logado le a linha
-- de TODOS os tenants (e-mail, telefone, empresa, consumo de tokens, custo
-- acumulado, metadados do projeto OpenAI).
--
-- O arnes mede ANTES, aplica a policy nova na MESMA transacao, mede DEPOIS e
-- termina em ROLLBACK. Nada toca producao.
--
-- Personas:
--   A = dono/admin de um tenant (PELE)
--   M = colaborador do tenant de A (team_members.auth_user_id; NAO tem linha
--       propria em profiles -- hoje ele le a linha do DONO so por causa do
--       using(true))
--   O = dono de OUTRO tenant (Contourline)
--   S = super admin (admin_users.is_super_admin)
--   X = profile sem nenhuma linha em team_members (conta isolada)
--   N = conta RECEM-CRIADA: usuario novo em auth.users criado dentro da
--       transacao, para o trigger handle_new_user montar o profile igual ao
--       cadastro real
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

insert into _ids(k, v) values
  ('a', 'e697878e-29c9-4b7e-88bb-869f4f2c76af'),
  ('s', '23da6832-ca42-4d5b-a59b-1aad8a6f3964');

insert into _ids(k, v)
select 'm', t.auth_user_id::text from public.team_members t
where t.user_id = (select v from _ids where k = 'a')::uuid
  and t.auth_user_id is not null
  and t.auth_user_id <> (select v from _ids where k = 'a')::uuid
limit 1;

insert into _ids(k, v)
select 'o', p.id::text from public.profiles p
where p.role = 'admin' and p.id <> (select v from _ids where k = 'a')::uuid
  and p.company_name is not null
limit 1;

insert into _ids(k, v)
select 'x', p.id::text from public.profiles p
where not exists (select 1 from public.team_members t where t.user_id = p.id)
limit 1;

-- Conta recem-criada de verdade: insere em auth.users e deixa o trigger
-- on_auth_user_created (handle_new_user) montar o profile.
do $h$
declare nid uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
                         email_confirmed_at, created_at, updated_at,
                         raw_app_meta_data, raw_user_meta_data)
  values (nid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'arnes-item2-' || replace(nid::text, '-', '') || '@example.invalid',
          crypt('arnes-item2', gen_salt('bf')), now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"Arnes Conta Nova","company_name":"Arnes Clinica Nova"}'::jsonb);
  insert into _ids(k, v) values ('n', nid::text);
  insert into _r(info) values ('setup | N conta recem-criada | criada em auth.users | profile='
    || exists(select 1 from public.profiles where id = nid)::text);
exception when others then
  insert into _r(info) values ('setup | N conta recem-criada | NAO criada (' || sqlstate || ') -> usando X como proxy');
end $h$;

insert into _r(info)
select 'setup | ' || k || ' = ' || coalesce(v, 'NULO') from _ids order by k;

insert into _r(info)
select 'setup | total de linhas em profiles = ' || count(*)::text from public.profiles;

insert into _r(info)
select 'setup | M tem linha propria em profiles = '
       || exists(select 1 from public.profiles p where p.id::text = (select v from _ids where k = 'm'))::text;

-- Sonda reutilizavel: o que a persona do JWT corrente consegue ver.
-- ATENCAO: `select *` / `count(*)` amplo em profiles ja falha com 42501 desde a
-- migration 20260922133000 (grant por coluna). Aqui so se lista coluna liberada.
create or replace function pg_temp._olha(rotulo text) returns void
language plpgsql as $f$
declare n bigint; alheios bigint; amostra text;
begin
  select count(id) into n from public.profiles;
  select count(id) into alheios from public.profiles
   where id <> auth.uid() and id is distinct from public.get_owner_id();
  select string_agg(coalesce(company_name, coalesce(role, '?')) || '/' || coalesce(email, '?')
                    || '/tokens=' || coalesce(tokens_total::text, '-')
                    || '/custo=' || coalesce(approximate_cost_total::text, '-'),
                    ' ; ' order by id)
    into amostra
    from (select id, company_name, role, email, tokens_total, approximate_cost_total
            from public.profiles
           where id <> auth.uid() and id is distinct from public.get_owner_id()
           limit 3) s;
  insert into _r(info) values (rotulo || ' | linhas visiveis=' || n::text
    || ' | de outros tenants=' || alheios::text
    || ' | vazamento=' || coalesce(amostra, '(nenhum)'));
exception when others then
  insert into _r(info) values (rotulo || ' | OLHA ERRO ' || sqlstate || ' ' || sqlerrm);
end $f$;

-- Sonda do que o FRONT faz hoje e nao pode quebrar (todas as 7 chamadas reais).
create or replace function pg_temp._front(rotulo text) returns void
language plpgsql as $f$
declare own uuid; n bigint;
begin
  own := public.get_owner_id();
  insert into _r(info) values (rotulo || ' | get_owner_id()=' || coalesce(own::text, 'NULO'));

  select count(id) into n from public.profiles where id = own; -- Settings / useMinhaConta
  insert into _r(info) values (rotulo || ' | Settings company_name+financial_access (por ownerId) | linhas=' || n::text);

  select count(id) into n from public.profiles
   where id = own and (recurrence_default_msg_1 is not null or true); -- useRecurrenceDefaults
  insert into _r(info) values (rotulo || ' | Recorrencia (msgs padrao da conta) | linhas=' || n::text);

  select count(id) into n from public.profiles
   where id = own and (orcamento_header_url is not null or true); -- useOrcamentoBranding
  insert into _r(info) values (rotulo || ' | Branding do orcamento | linhas=' || n::text);

  select count(id) into n from public.profiles
   where id = own and (auto_close_enabled is not null or true); -- AutoCloseSettings
  insert into _r(info) values (rotulo || ' | AutoCloseSettings | linhas=' || n::text);

  select count(id) into n from public.profiles where id = auth.uid(); -- useSupportChat/useAdminUser/senha
  insert into _r(info) values (rotulo || ' | Perfil proprio (chat suporte / troca de senha) | linhas=' || n::text);
exception when others then
  insert into _r(info) values (rotulo || ' | ERRO ' || sqlstate || ' ' || sqlerrm);
end $f$;

create or replace function pg_temp._como(k text, fase text) returns void
language plpgsql as $f$
declare id text;
begin
  id := (select v from _ids where _ids.k = _como.k);
  if id is null then
    insert into _r(info) values (fase || ' | ' || upper(k) || ' | persona ausente, pulado');
    return;
  end if;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', id, 'role', 'authenticated')::text);
  perform pg_temp._olha(fase || ' | ' || upper(k));
  perform pg_temp._front(fase || ' | ' || upper(k));
  execute 'reset role';
  execute 'reset request.jwt.claims';
end $f$;

-- ===========================================================================
-- FASE ANTES
-- ===========================================================================
select pg_temp._como('a', 'ANTES');
select pg_temp._como('m', 'ANTES');
select pg_temp._como('o', 'ANTES');
select pg_temp._como('s', 'ANTES');
select pg_temp._como('x', 'ANTES');
select pg_temp._como('n', 'ANTES');

-- anon: tem grant de coluna, mas nenhuma policy de SELECT o alcanca.
set local role anon;
set local request.jwt.claims = '';
do $h$
declare n bigint;
begin
  select count(id) into n from public.profiles;
  insert into _r(info) values ('ANTES | ANON | linhas visiveis=' || n::text);
exception when others then
  insert into _r(info) values ('ANTES | ANON | BLOQUEADO ' || sqlstate);
end $h$;
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- APPLY (mesma transacao)
-- ===========================================================================
drop policy if exists "Users can view all profiles" on public.profiles;

create policy profiles_select_scoped on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or id = public.get_owner_id()
  or public.is_super_admin()
);

-- Passo opcional do plano: tirar o SELECT do anon (hoje inerte por RLS).
revoke select on public.profiles from anon;

-- ===========================================================================
-- FASE DEPOIS
-- ===========================================================================
select pg_temp._como('a', 'DEPOIS');
select pg_temp._como('m', 'DEPOIS');
select pg_temp._como('o', 'DEPOIS');
select pg_temp._como('s', 'DEPOIS');
select pg_temp._como('x', 'DEPOIS');
select pg_temp._como('n', 'DEPOIS');

set local role anon;
set local request.jwt.claims = '';
do $h$
declare n bigint;
begin
  select count(id) into n from public.profiles;
  insert into _r(info) values ('DEPOIS | ANON | linhas visiveis=' || n::text);
exception when others then
  insert into _r(info) values ('DEPOIS | ANON | BLOQUEADO ' || sqlstate);
end $h$;
reset role;
reset request.jwt.claims;

-- service_role (edge functions e crons) nunca passa por RLS.
set local role service_role;
do $h$
declare n bigint;
begin
  select count(id) into n from public.profiles;
  insert into _r(info) values ('DEPOIS | service_role | linhas visiveis=' || n::text);
exception when others then
  insert into _r(info) values ('DEPOIS | service_role | BLOQUEADO ' || sqlstate);
end $h$;
reset role;

-- As RPCs do painel admin sao SECURITY DEFINER: nao dependem da policy.
insert into _r(info)
select 'DEPOIS | RPC admin | ' || p.proname || ' | secdef=' || p.prosecdef::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.proname in ('admin_get_all_profiles', 'admin_get_pending_profiles', 'admin_get_inactive_profiles');

insert into _r(info)
select 'DEPOIS | policies de SELECT em profiles | ' || policyname || ' | using=' || coalesce(qual, '-')
from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL');

select info from _r order by ord;

rollback;
