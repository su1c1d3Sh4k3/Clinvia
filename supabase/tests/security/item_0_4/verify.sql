-- Verify pos-apply do item 0.4 contra o estado REAL. Termina em rollback.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

insert into _r
select 1, 'GRANT EXECUTE | ' || pg_get_userbyid(ac.grantee)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) ac
where n.nspname = 'public' and p.proname = 'send_push_notification'
  and ac.privilege_type = 'EXECUTE';

insert into _r select 2, 'CHAMADORES REAIS | ' || count(*)::text from (
  select 1 from pg_proc p
   where p.prokind in ('f','p') and p.proname <> 'send_push_notification'
     and coalesce(p.prosrc,'') like '%send_push_notification%'
  union all
  select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and coalesce(p.prosrc,'') like '%send_push_notification%'
) s;

do $$
declare
  v_tenant uuid := (select p.id from public.profiles p where p.role = 'admin'
                     order by p.created_at limit 1);
  persona text;
begin
  foreach persona in array array['AUTHENTICATED','ANON'] loop
    reset role;
    if persona = 'ANON' then
      set local role anon;
      perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    else
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
    end if;

    begin
      execute format('select public.send_push_notification(%L, ''Clinbia'',
                        ''clique aqui'', ''info'', ''https://x.invalid'', ''arnes'')', v_tenant);
      insert into _r values (3, persona || ' | dispara push arbitrario | PASSOU');
    exception when others then
      insert into _r values (3, persona || ' | dispara push arbitrario | BLOQUEADO ' || sqlstate);
    end;
  end loop;

  reset role;
  set local role service_role;
  begin
    execute format('select public.send_push_notification(%L, ''Clinbia'', ''x'')', v_tenant);
    insert into _r values (4, 'SERVICE_ROLE | pode executar | SIM');
  exception when others then
    insert into _r values (4, 'SERVICE_ROLE | pode executar | NAO ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
