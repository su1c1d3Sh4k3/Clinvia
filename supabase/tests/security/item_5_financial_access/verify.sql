-- Verify pos-apply do item 5 (financial_access por RPC). Termina em rollback.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

insert into _r
select 1, 'PRIVILEGIO DA COLUNA | ' || r.rolname
  || ' | update=' || has_column_privilege(r.rolname, 'public.profiles', 'financial_access', 'UPDATE')::text
  || ' | insert=' || has_column_privilege(r.rolname, 'public.profiles', 'financial_access', 'INSERT')::text
  || ' | select=' || has_column_privilege(r.rolname, 'public.profiles', 'financial_access', 'SELECT')::text
from pg_roles r where r.rolname in ('anon','authenticated','service_role');

insert into _r
select 2, 'RPC | set_financial_access | definer=' || p.prosecdef::text
  || ' | search_path=' || coalesce(array_to_string(p.proconfig, ','), '(nenhum)')
  || ' | anon exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
  || ' | auth exec=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'set_financial_access';

do $$
declare
  v_owner uuid := (select p.id from public.profiles p where p.role = 'admin'
                    order by p.created_at limit 1);
  v_outro uuid := (select p.id from public.profiles p where p.role = 'admin'
                    order by p.created_at desc limit 1);
  v_agent uuid;
  b boolean;
  n bigint;
begin
  select tm.auth_user_id into v_agent from public.team_members tm
   where tm.role::text <> 'admin' and tm.auth_user_id is not null limit 1;

  insert into _r values (3, 'PERSONAS | dono=' || coalesce(v_owner::text,'(nenhum)')
    || ' | outro dono=' || coalesce(v_outro::text,'(nenhum)')
    || ' | colaborador nao-admin=' || coalesce(v_agent::text,'(nenhum)'));

  -- DONO: caminho legitimo pelo RPC
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  begin
    execute 'select public.set_financial_access(false)' into b;
    select count(*) into n from public.profiles
     where id = v_owner and financial_access = false;
    insert into _r values (4, 'DONO | RPC set_financial_access(false) | PASSOU | linha gravada=' || n);
  exception when others then
    insert into _r values (4, 'DONO | RPC set_financial_access(false) | FALHOU '
      || sqlstate || ' ' || sqlerrm);
  end;

  -- DONO: ataque direto na coluna (era o caminho antigo do front)
  begin
    execute format('update public.profiles set financial_access = true where id = %L', v_owner);
    insert into _r values (4, 'DONO | UPDATE direto da coluna | PASSOU');
  exception when others then
    insert into _r values (4, 'DONO | UPDATE direto da coluna | BLOQUEADO ' || sqlstate);
  end;

  -- DONO: ataque na linha de outro tenant
  begin
    execute format('update public.profiles set financial_access = true where id = %L', v_outro);
    select count(*) into n from public.profiles where id = v_outro and financial_access = true;
    insert into _r values (4, 'DONO | UPDATE na linha de outro dono | PASSOU | linhas=' || n);
  exception when others then
    insert into _r values (4, 'DONO | UPDATE na linha de outro dono | BLOQUEADO ' || sqlstate);
  end;

  -- DONO: upsert do Settings.updateCompany precisa continuar funcionando
  begin
    execute format('insert into public.profiles (id, company_name, updated_at)
                    values (%L, ''Arnes LTDA'', now())
                    on conflict (id) do update set company_name = excluded.company_name,
                                                   updated_at = excluded.updated_at', v_owner);
    insert into _r values (5, 'DONO | upsert do updateCompany | PASSOU');
  exception when others then
    insert into _r values (5, 'DONO | upsert do updateCompany | FALHOU '
      || sqlstate || ' ' || sqlerrm);
  end;

  -- COLABORADOR NAO-ADMIN: nao pode se dar acesso financeiro
  if v_agent is not null then
    reset role;
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
    begin
      execute 'select public.set_financial_access(true)' into b;
      insert into _r values (6, 'COLABORADOR NAO-ADMIN | RPC | PASSOU (nao deveria)');
    exception when others then
      insert into _r values (6, 'COLABORADOR NAO-ADMIN | RPC | BLOQUEADO ' || sqlstate);
    end;
  end if;

  -- ANON
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin
    execute 'select public.set_financial_access(true)' into b;
    insert into _r values (7, 'ANON | RPC | PASSOU (nao deveria)');
  exception when others then
    insert into _r values (7, 'ANON | RPC | BLOQUEADO ' || sqlstate);
  end;

  -- SERVICE_ROLE continua com UPDATE de tabela (crons/edge functions)
  reset role;
  set local role service_role;
  begin
    execute format('update public.profiles set financial_access = true where id = %L', v_owner);
    insert into _r values (8, 'SERVICE_ROLE | UPDATE direto | PASSOU');
  exception when others then
    insert into _r values (8, 'SERVICE_ROLE | UPDATE direto | FALHOU ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
