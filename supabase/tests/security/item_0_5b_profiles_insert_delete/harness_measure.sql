
-- ===== MEDICAO @FASE@ =====
do $m$
declare
  a    text := (select v from _ids where k = 'a');
  g    text := (select v from _ids where k = 'g');
  semp text := (select v from _ids where k = 'semperfil');
  outro text := (select v from _ids where k = 'outro');
  n    bigint;
begin
  -- ---------- A: dono com linha em profiles ----------
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', a, 'role', 'authenticated')::text);

  -- 1) DELETE da propria linha
  begin
    delete from public.profiles where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('@FASE@ | A | DELETE da propria linha | linhas=' || n::text);
    -- 2) INSERT de volta com role super-admin
    begin
      insert into public.profiles(id, role, status, full_name)
      values (a::uuid, 'super-admin', 'ativo', 'arnes');
      insert into _r(info) values ('@FASE@ | A | reinsere a propria linha como super-admin | PASSOU');
    exception when others then
      insert into _r(info) values ('@FASE@ | A | reinsere a propria linha como super-admin | BLOQUEADO ' || sqlstate);
    end;
    insert into _r(info)
    select '@FASE@ | A | is_super_admin=' || public.is_super_admin()::text
           || ' is_admin_staff=' || public.is_admin_staff()::text;
  exception when others then
    insert into _r(info) values ('@FASE@ | A | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- 3) INSERT de linha para OUTRO id (policy de signup nao ancora o id)
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes injetado');
    insert into _r(info) values ('@FASE@ | A | injeta profile de OUTRO auth user (role=admin) | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | A | injeta profile de OUTRO auth user | BLOQUEADO ' || sqlstate);
  end;

  -- 4) UPDATE tentando mudar o id da propria linha para outro usuario
  begin
    update public.profiles set id = outro::uuid where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('@FASE@ | A | UPDATE id -> outro usuario | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A | UPDATE id -> outro usuario | BLOQUEADO ' || sqlstate);
  end;

  -- 5) LEGITIMO: upsert do Settings.updateCompany
  begin
    insert into public.profiles(id, company_name, updated_at)
    values (a::uuid, 'Arnes Clinica', now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('@FASE@ | A | LEGITIMO upsert updateCompany | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | A | LEGITIMO upsert updateCompany | QUEBROU ' || sqlstate);
  end;

  -- ---------- G: role agent ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', g, 'role', 'authenticated')::text);
  begin
    delete from public.profiles where id = g::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('@FASE@ | G (agent) | DELETE da propria linha | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | G (agent) | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- SEM PERFIL: usuario de auth sem linha em profiles ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', semp, 'role', 'authenticated')::text);
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'super-admin', 'ativo', 'arnes sem perfil');
    insert into _r(info) values ('@FASE@ | SEM PERFIL | cria a propria linha como super-admin | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | SEM PERFIL | cria a propria linha como super-admin | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.profiles(id, full_name) values (semp::uuid, 'arnes sem perfil');
    insert into _r(info)
    select '@FASE@ | SEM PERFIL | cria a propria linha sem citar role | PASSOU, role nasceu='
           || coalesce(p.role, '-') || ' status=' || coalesce(p.status, '-')
    from public.profiles p where p.id = semp::uuid;
  exception when others then
    insert into _r(info) values ('@FASE@ | SEM PERFIL | cria a propria linha sem citar role | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- ANON ----------
  execute 'reset role';
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes anon');
    insert into _r(info) values ('@FASE@ | ANON | injeta profile role=admin | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | ANON | injeta profile role=admin | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- service_role ----------
  execute 'reset role';
  execute 'set local role service_role';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'ativo', 'arnes service');
    insert into _r(info) values ('@FASE@ | service_role | cria profile com role | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | service_role | cria profile com role | QUEBROU ' || sqlstate);
  end;
  begin
    delete from public.profiles where id = semp::uuid;
    insert into _r(info) values ('@FASE@ | service_role | apaga profile | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | service_role | apaga profile | QUEBROU ' || sqlstate);
  end;

  execute 'reset role';
end $m$;

reset role;

-- Restaura o ponto de partida para a fase seguinte medir do mesmo lugar.
update public.profiles set role = 'admin', status = 'ativo'
where id::text = (select v from _ids where k = 'a') and role <> 'admin';
update public.profiles set role = 'agent'
where id::text = (select v from _ids where k = 'g') and role <> 'agent';
delete from public.profiles where id::text = (select v from _ids where k = 'semperfil');
