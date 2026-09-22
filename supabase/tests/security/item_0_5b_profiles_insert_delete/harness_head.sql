-- ARNES do item 3 (profiles: INSERT/DELETE). Mede ANTES, aplica a migration na
-- MESMA transacao, mede DEPOIS e termina em ROLLBACK. Nada toca producao.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

-- A = dono admin (mesma persona do 0.5)
insert into _ids(k, v)
select 'a', p.id::text from public.profiles p
where p.id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af';

-- G = alguem com role agent
insert into _ids(k, v)
select 'g', p.id::text from public.profiles p where p.role = 'agent' limit 1;

-- SEM PERFIL = usuario de auth sem linha em profiles
insert into _ids(k, v)
select 'semperfil', u.id::text from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
limit 1;

-- OUTRO = qualquer outro perfil, alvo do teste de troca de id
insert into _ids(k, v)
select 'outro', p.id::text from public.profiles p
where p.id <> 'e697878e-29c9-4b7e-88bb-869f4f2c76af'
  and p.role <> 'super-admin'
limit 1;

insert into _r(info) select 'setup | ' || k || ' = ' || v from _ids order by k;
