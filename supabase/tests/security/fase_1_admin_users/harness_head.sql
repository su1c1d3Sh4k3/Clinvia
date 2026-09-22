-- ARNES da Fase 1 (super admin via admin_users). Mede ANTES, aplica a migration
-- na MESMA transacao, mede DEPOIS e termina em ROLLBACK. Nada toca producao.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

insert into _ids(k, v)
select 'sa', p.id::text from public.profiles p where p.role = 'super-admin' limit 1;

insert into _ids(k, v)
select 'a', p.id::text from public.profiles p
where p.id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af';

-- G = colaborador com role agent (segunda persona authenticated do teste
-- de escrita em admin_users)
insert into _ids(k, v)
select 'g', p.id::text from public.profiles p where p.role = 'agent' limit 1;

insert into _r(info) select 'setup | ' || k || ' = ' || v from _ids order by k;
