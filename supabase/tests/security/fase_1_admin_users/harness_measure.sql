
-- ===== MEDICAO @FASE@ =====
do $m$
declare
  sa  text := (select v from _ids where k = 'sa');
  a   text := (select v from _ids where k = 'a');
  gg  text := (select v from _ids where k = 'g');
  persona text;
  uid text;
  n   bigint;
begin
  -- ---- SUPER ADMIN ----
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', sa, 'role', 'authenticated')::text);

  insert into _r(info)
  select '@FASE@ | SA | is_super_admin=' || public.is_super_admin()::text
         || ' is_admin_staff=' || public.is_admin_staff()::text
         || ' admin_can(clientes,edit)=' || public.admin_can('clientes','edit')::text;

  begin
    select count(*) into n from public.pending_signups;
    insert into _r(info) values ('@FASE@ | SA | pending_signups legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | pending_signups | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.token_usage_log;
    insert into _r(info) values ('@FASE@ | SA | token_usage_log legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | token_usage_log | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.system_updates;
    insert into _r(info) values ('@FASE@ | SA | system_updates legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | system_updates | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_pending_profiles();
    insert into _r(info) values ('@FASE@ | SA | admin_get_pending_profiles=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_get_pending_profiles | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_inactive_profiles();
    insert into _r(info) values ('@FASE@ | SA | admin_get_inactive_profiles=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_get_inactive_profiles | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_team_members(a::uuid);
    insert into _r(info) values ('@FASE@ | SA | admin_get_team_members(A)=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_get_team_members | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_all_profiles();
    insert into _r(info) values ('@FASE@ | SA | admin_get_all_profiles=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_get_all_profiles | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_list_client_options();
    insert into _r(info) values ('@FASE@ | SA | admin_list_client_options=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_list_client_options | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.support_tickets;
    insert into _r(info) values ('@FASE@ | SA | support_tickets legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | support_tickets | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.system_config;
    insert into _r(info) values ('@FASE@ | SA | system_config legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | system_config | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_users;
    insert into _r(info) values ('@FASE@ | SA | admin_users legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | SA | admin_users | ERRO ' || sqlstate);
  end;

  -- ---- TENANT COMUM (dono de clinica) ----
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', a, 'role', 'authenticated')::text);

  insert into _r(info)
  select '@FASE@ | TENANT | is_super_admin=' || public.is_super_admin()::text
         || ' is_admin_staff=' || public.is_admin_staff()::text
         || ' admin_can(clientes,view)=' || public.admin_can('clientes','view')::text;

  begin
    select count(*) into n from public.pending_signups;
    insert into _r(info) values ('@FASE@ | TENANT | pending_signups legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | pending_signups | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.token_usage_log;
    insert into _r(info) values ('@FASE@ | TENANT | token_usage_log legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | token_usage_log | ERRO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_pending_profiles();
    insert into _r(info) values ('@FASE@ | TENANT | admin_get_pending_profiles=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | admin_get_pending_profiles | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_get_team_members(a::uuid);
    insert into _r(info) values ('@FASE@ | TENANT | admin_get_team_members=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | admin_get_team_members | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.admin_users;
    insert into _r(info) values ('@FASE@ | TENANT | admin_users legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | admin_users | ERRO ' || sqlstate);
  end;

  begin
    insert into public.system_updates(type, title, content)
    values ('alert', 'arnes f1', 'nao deveria entrar');
    insert into _r(info) values ('@FASE@ | TENANT | forja aviso do sistema | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | TENANT | forja aviso do sistema | BLOQUEADO ' || sqlstate);
  end;

  -- ---- ESCRITA EM admin_users (bloqueante da Fase 1) ----
  -- Rodado como ADMIN (dono de clinica) e como AGENT, os dois authenticated.
  -- `execute` porque a coluna is_super_admin so existe depois da migration.
  foreach persona in array array['ADMIN', 'AGENT'] loop
    uid := case persona when 'ADMIN' then a else gg end;
    execute 'reset role';
    execute 'set local role authenticated';
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', uid, 'role', 'authenticated')::text);

    begin
      execute format(
        'insert into public.admin_users(auth_user_id, name, email, is_active,'
        || ' is_super_admin, permissions) values (%L, %L, %L, true, true, ''{}''::jsonb)',
        uid, 'arnes ' || persona, 'arnes-' || lower(persona) || '@teste.local');
      insert into _r(info) values ('@FASE@ | ' || persona || ' | INSERT linha propria is_super_admin=true | PASSOU');
    exception when others then
      insert into _r(info) values ('@FASE@ | ' || persona || ' | INSERT linha propria is_super_admin=true | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'update public.admin_users set is_super_admin = true';
      get diagnostics n = row_count;
      insert into _r(info) values ('@FASE@ | ' || persona || ' | UPDATE is_super_admin | PASSOU linhas=' || n::text);
    exception when others then
      insert into _r(info) values ('@FASE@ | ' || persona || ' | UPDATE is_super_admin | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'delete from public.admin_users where is_super_admin';
      get diagnostics n = row_count;
      insert into _r(info) values ('@FASE@ | ' || persona || ' | DELETE do super admin | PASSOU linhas=' || n::text);
    exception when others then
      insert into _r(info) values ('@FASE@ | ' || persona || ' | DELETE do super admin | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'update public.admin_users set is_active = false';
      get diagnostics n = row_count;
      insert into _r(info) values ('@FASE@ | ' || persona || ' | UPDATE is_active (desativa painel) | PASSOU linhas=' || n::text);
    exception when others then
      insert into _r(info) values ('@FASE@ | ' || persona || ' | UPDATE is_active (desativa painel) | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'select count(*) from public.admin_users' into n;
      insert into _r(info) values ('@FASE@ | ' || persona || ' | SELECT admin_users (o painel precisa) | linhas=' || n::text);
    exception when others then
      insert into _r(info) values ('@FASE@ | ' || persona || ' | SELECT admin_users | BLOQUEADO ' || sqlstate);
    end;
  end loop;

  -- ---- ANON ----
  execute 'reset role';
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';

  begin
    select count(*) into n from public.admin_users;
    insert into _r(info) values ('@FASE@ | ANON | admin_users legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | ANON | admin_users | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.token_usage_log;
    insert into _r(info) values ('@FASE@ | ANON | token_usage_log legiveis=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | ANON | token_usage_log | BLOQUEADO ' || sqlstate);
  end;

  execute 'reset role';
end $m$;

reset role;
