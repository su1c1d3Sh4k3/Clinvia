begin;
set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;

do $m$
declare
  a    text := 'e697878e-29c9-4b7e-88bb-869f4f2c76af';
  semp text;
begin
  select u.id::text into semp from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id) limit 1;
  insert into _r(info) values ('semperfil = ' || semp);

  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', a, 'role', 'authenticated')::text);
  insert into _r(info) select 'auth.uid() visto = ' || coalesce(auth.uid()::text, 'NULL');
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes injetado');
    insert into _r(info) values ('A injeta outro id | PASSOU');
  exception when others then
    insert into _r(info) values ('A injeta outro id | ' || sqlstate || ' | ' || sqlerrm);
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', semp, 'role', 'authenticated')::text);
  insert into _r(info) select 'auth.uid() visto (semperfil) = ' || coalesce(auth.uid()::text, 'NULL');
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'super-admin', 'ativo', 'arnes sem perfil');
    insert into _r(info) values ('SEM PERFIL cria propria linha super-admin | PASSOU');
  exception when others then
    insert into _r(info) values ('SEM PERFIL cria propria linha super-admin | ' || sqlstate || ' | ' || sqlerrm);
  end;
  begin
    insert into public.profiles(id, full_name) values (semp::uuid, 'arnes sem perfil');
    insert into _r(info) values ('SEM PERFIL cria propria linha sem role | PASSOU');
  exception when others then
    insert into _r(info) values ('SEM PERFIL cria propria linha sem role | ' || sqlstate || ' | ' || sqlerrm);
  end;
  execute 'reset role';
end $m$;

reset role;
select info from _r order by ord;

rollback;
