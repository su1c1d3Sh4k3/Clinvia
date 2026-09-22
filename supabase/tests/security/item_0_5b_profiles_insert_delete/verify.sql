-- Verificacao pos-apply do 20260922240000 contra o estado REAL. Termina em rollback.
begin;
set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;

insert into _r(info) select 'GRANT TABELA | ' || grantee || ' | '
       || string_agg(distinct privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon','authenticated','service_role')
group by grantee;

insert into _r(info) select 'GRANT INSERT COLUNA | ' || grantee || ' | ' || count(*)::text || ' colunas'
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon','authenticated') and privilege_type = 'INSERT'
group by grantee;

do $m$
declare
  a    text := 'e697878e-29c9-4b7e-88bb-869f4f2c76af';
  g    text;
  semp text;
  n    bigint;
begin
  select p.id::text into g from public.profiles p where p.role = 'agent' limit 1;
  select u.id::text into semp from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id) limit 1;

  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', a, 'role', 'authenticated')::text);
  begin
    delete from public.profiles where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ATAQUE | A apaga a propria linha | PASSOU linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ATAQUE | A apaga a propria linha | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'super-admin', 'ativo', 'verify');
    insert into _r(info) values ('ATAQUE | A injeta profile super-admin | PASSOU');
  exception when others then
    insert into _r(info) values ('ATAQUE | A injeta profile super-admin | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.profiles(id, company_name, updated_at)
    values (a::uuid, 'Verify Clinica', now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('LEGITIMO | upsert updateCompany | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | upsert updateCompany | QUEBROU ' || sqlstate);
  end;
  begin
    update public.profiles set full_name = full_name, updated_at = now() where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('LEGITIMO | update nome/updated_at | PASSOU linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('LEGITIMO | update nome/updated_at | QUEBROU ' || sqlstate);
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', g, 'role', 'authenticated')::text);
  begin
    delete from public.profiles where id = g::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ATAQUE | agent apaga a propria linha | PASSOU linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ATAQUE | agent apaga a propria linha | BLOQUEADO ' || sqlstate);
  end;

  execute 'reset role';
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'verify anon');
    insert into _r(info) values ('ATAQUE | anon injeta profile | PASSOU');
  exception when others then
    insert into _r(info) values ('ATAQUE | anon injeta profile | BLOQUEADO ' || sqlstate);
  end;

  execute 'reset role';
  execute 'set local role service_role';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'ativo', 'verify service');
    insert into _r(info) values ('SERVICE_ROLE | cria profile com role | PASSOU');
    delete from public.profiles where id = semp::uuid;
    insert into _r(info) values ('SERVICE_ROLE | apaga profile | PASSOU');
  exception when others then
    insert into _r(info) values ('SERVICE_ROLE | escrita em profiles | QUEBROU ' || sqlstate);
  end;
  execute 'reset role';
end $m$;

reset role;
select info from _r order by ord;

rollback;
