-- Verify pos-apply da Fase 1 contra o estado REAL. Termina em rollback.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

insert into _r
select 1, 'ADMIN_USERS | linhas=' || count(*)::text
  || ' | super_ativos=' || count(*) filter (where is_super_admin and is_active)::text
from public.admin_users;

insert into _r
select 2, 'GRANT TABELA | ' || pg_get_userbyid(ac.grantee) || ' | '
  || string_agg(distinct ac.privilege_type, ',' order by ac.privilege_type)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) ac
where n.nspname = 'public' and c.relname = 'admin_users'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated','service_role')
group by pg_get_userbyid(ac.grantee);

insert into _r
select 3, 'FONTE DE VERDADE | is_super_admin le admin_users='
  || (coalesce(p.prosrc, '') like '%admin_users%')::text
  || ' | le profiles.role=' || (coalesce(p.prosrc, '') like '%profiles%')::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_super_admin';

do $$
declare
  v_sa uuid := (select a.auth_user_id from public.admin_users a
                 where a.is_super_admin and a.is_active limit 1);
  v_tenant uuid := (select p.id from public.profiles p
                     where p.role = 'admin' order by p.created_at limit 1);
  persona text;
  uid uuid;
  n bigint;
  b boolean;
begin
  insert into _r values (4, 'PERSONAS | sa=' || coalesce(v_sa::text,'(nenhum)')
                            || ' | tenant=' || coalesce(v_tenant::text,'(nenhum)'));

  foreach persona in array array['SA','TENANT'] loop
    uid := case persona when 'SA' then v_sa else v_tenant end;
    reset role;
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true);

    execute 'select public.is_super_admin()' into b;
    insert into _r values (5, persona || ' | is_super_admin()=' || b::text);

    begin
      execute 'select count(*) from public.admin_get_pending_profiles()' into n;
      insert into _r values (6, persona || ' | admin_get_pending_profiles | linhas=' || n);
    exception when others then
      insert into _r values (6, persona || ' | admin_get_pending_profiles | NEGADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.admin_get_inactive_profiles()' into n;
      insert into _r values (6, persona || ' | admin_get_inactive_profiles | linhas=' || n);
    exception when others then
      insert into _r values (6, persona || ' | admin_get_inactive_profiles | NEGADO ' || sqlstate);
    end;

    begin
      execute format('select count(*) from public.admin_get_team_members(%L)', v_tenant) into n;
      insert into _r values (6, persona || ' | admin_get_team_members | linhas=' || n);
    exception when others then
      insert into _r values (6, persona || ' | admin_get_team_members | NEGADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.pending_signups' into n;
      insert into _r values (7, persona || ' | le pending_signups | linhas=' || n);
    exception when others then
      insert into _r values (7, persona || ' | le pending_signups | NEGADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.token_usage_log' into n;
      insert into _r values (7, persona || ' | le token_usage_log | linhas=' || n);
    exception when others then
      insert into _r values (7, persona || ' | le token_usage_log | NEGADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.system_updates' into n;
      insert into _r values (7, persona || ' | le system_updates | linhas=' || n);
    exception when others then
      insert into _r values (7, persona || ' | le system_updates | NEGADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.admin_users' into n;
      insert into _r values (8, persona || ' | le admin_users | linhas=' || n);
    exception when others then
      insert into _r values (8, persona || ' | le admin_users | NEGADO ' || sqlstate);
    end;

    -- ataques de escrita
    begin
      execute format('insert into public.admin_users(auth_user_id, name, email, is_active,
                        is_super_admin, client_scope, permissions)
                      values (%L, ''arnes'', ''arnes@x.com'', true, true, ''all'', ''{}''::jsonb)', uid);
      insert into _r values (9, persona || ' | INSERT linha propria is_super_admin=true | PASSOU');
    exception when others then
      insert into _r values (9, persona || ' | INSERT linha propria is_super_admin=true | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'update public.admin_users set is_super_admin = true';
      insert into _r values (9, persona || ' | UPDATE is_super_admin | PASSOU');
    exception when others then
      insert into _r values (9, persona || ' | UPDATE is_super_admin | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'delete from public.admin_users where is_super_admin';
      insert into _r values (9, persona || ' | DELETE do super admin | PASSOU');
    exception when others then
      insert into _r values (9, persona || ' | DELETE do super admin | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'update public.admin_users set is_active = false';
      insert into _r values (9, persona || ' | UPDATE is_active (desativa painel) | PASSOU');
    exception when others then
      insert into _r values (9, persona || ' | UPDATE is_active (desativa painel) | BLOQUEADO ' || sqlstate);
    end;
  end loop;

  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin
    execute 'select count(*) from public.admin_users' into n;
    insert into _r values (10, 'ANON | le admin_users | PASSOU linhas=' || n);
  exception when others then
    insert into _r values (10, 'ANON | le admin_users | BLOQUEADO ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
