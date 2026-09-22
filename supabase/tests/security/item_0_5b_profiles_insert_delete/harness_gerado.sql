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

-- ===== MEDICAO ANTES =====
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
    insert into _r(info) values ('ANTES | A | DELETE da propria linha | linhas=' || n::text);
    -- 2) INSERT de volta com role super-admin
    begin
      insert into public.profiles(id, role, status, full_name)
      values (a::uuid, 'super-admin', 'ativo', 'arnes');
      insert into _r(info) values ('ANTES | A | reinsere a propria linha como super-admin | PASSOU');
    exception when others then
      insert into _r(info) values ('ANTES | A | reinsere a propria linha como super-admin | BLOQUEADO ' || sqlstate);
    end;
    insert into _r(info)
    select 'ANTES | A | is_super_admin=' || public.is_super_admin()::text
           || ' is_admin_staff=' || public.is_admin_staff()::text;
  exception when others then
    insert into _r(info) values ('ANTES | A | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- 3) INSERT de linha para OUTRO id (policy de signup nao ancora o id)
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes injetado');
    insert into _r(info) values ('ANTES | A | injeta profile de OUTRO auth user (role=admin) | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | A | injeta profile de OUTRO auth user | BLOQUEADO ' || sqlstate);
  end;

  -- 4) UPDATE tentando mudar o id da propria linha para outro usuario
  begin
    update public.profiles set id = outro::uuid where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A | UPDATE id -> outro usuario | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A | UPDATE id -> outro usuario | BLOQUEADO ' || sqlstate);
  end;

  -- 5) LEGITIMO: upsert do Settings.updateCompany
  begin
    insert into public.profiles(id, company_name, updated_at)
    values (a::uuid, 'Arnes Clinica', now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('ANTES | A | LEGITIMO upsert updateCompany | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | A | LEGITIMO upsert updateCompany | QUEBROU ' || sqlstate);
  end;

  -- ---------- G: role agent ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', g, 'role', 'authenticated')::text);
  begin
    delete from public.profiles where id = g::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | G (agent) | DELETE da propria linha | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | G (agent) | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- SEM PERFIL: usuario de auth sem linha em profiles ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', semp, 'role', 'authenticated')::text);
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'super-admin', 'ativo', 'arnes sem perfil');
    insert into _r(info) values ('ANTES | SEM PERFIL | cria a propria linha como super-admin | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | SEM PERFIL | cria a propria linha como super-admin | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.profiles(id, full_name) values (semp::uuid, 'arnes sem perfil');
    insert into _r(info)
    select 'ANTES | SEM PERFIL | cria a propria linha sem citar role | PASSOU, role nasceu='
           || coalesce(p.role, '-') || ' status=' || coalesce(p.status, '-')
    from public.profiles p where p.id = semp::uuid;
  exception when others then
    insert into _r(info) values ('ANTES | SEM PERFIL | cria a propria linha sem citar role | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- ANON ----------
  execute 'reset role';
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes anon');
    insert into _r(info) values ('ANTES | ANON | injeta profile role=admin | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | ANON | injeta profile role=admin | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- service_role ----------
  execute 'reset role';
  execute 'set local role service_role';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'ativo', 'arnes service');
    insert into _r(info) values ('ANTES | service_role | cria profile com role | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | service_role | cria profile com role | QUEBROU ' || sqlstate);
  end;
  begin
    delete from public.profiles where id = semp::uuid;
    insert into _r(info) values ('ANTES | service_role | apaga profile | PASSOU');
  exception when others then
    insert into _r(info) values ('ANTES | service_role | apaga profile | QUEBROU ' || sqlstate);
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


reset role;
-- ===== APPLY DA MIGRATION (na mesma transacao) =====
-- Item 0.5 (continuacao): o revoke de UPDATE de 20260922220000 era CONTORNAVEL
-- por DELETE + INSERT da propria linha.
--
-- ESTADO ANTES (probe supabase/.temp/_f06_probe.sql):
--   - policy `profiles_all` e FOR ALL com using/check `id = auth.uid()` ⇒ cobre
--     DELETE e INSERT da propria linha;
--   - `grant delete, insert on profiles to authenticated` valia para a tabela
--     inteira (INSERT liberado nas 51 colunas).
--   Logo: `delete from profiles where id = auth.uid()` seguido de
--   `insert into profiles(id, role) values (auth.uid(), 'super-admin')` recriava
--   a linha com o privilegio que o UPDATE nao deixava mais escrever — e tambem
--   zerava markup, tokens e limites (a linha nasce do zero).
--   Um usuario de auth SEM linha em profiles (27 existem) fazia o INSERT direto.
--   Alem disso, a policy `Allow anonymous signup insert` (roles=public,
--   check `status='pendente' AND role='admin'`) NAO ancora o `id`: dava para
--   injetar linha de profiles para o id de outra pessoa.
--
-- CORRECAO (mesmo padrao do 0.5):
--   - DELETE sai de authenticated/anon (nenhuma tela apaga a propria linha de
--     profiles; exclusao de conta e admin_delete_tenant_data / edge functions,
--     que rodam como service_role);
--   - INSERT sai da tabela e volta nas mesmas colunas seguras do UPDATE, entao
--     `role` nasce sempre no default 'agent' e `status` em 'ativo'. Isso tambem
--     mata a injecao pela policy de signup, que exige role='admin'.
--
-- NAO AFETA: service_role (edge functions, crons, approve-client,
-- admin-create-user, admin-delete-client), as 6 funcoes SECURITY DEFINER e o
-- upsert de Settings.updateCompany (id, company_name, updated_at).
--
-- Rollback: 20260922240000_profiles_lock_insert_delete_rollback.sql


revoke delete on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;

grant insert (
  id, full_name, avatar_url, company_name, phone, address, email, instagram,
  notifications_enabled, group_notifications_enabled, financial_access,
  must_change_password, updated_at,
  recurrence_dispatch_hour, recurrence_campaign_duration_days,
  recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3,
  auto_close_enabled, auto_close_warning_minutes, auto_close_final_minutes,
  auto_close_warning_message, auto_close_final_message,
  auto_close_no_interaction_enabled, auto_close_no_interaction_hours,
  auto_close_no_interaction_include_customer,
  orcamento_header_url, orcamento_footer_text
) on public.profiles to authenticated;

-- ===== MEDICAO DEPOIS =====
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
    insert into _r(info) values ('DEPOIS | A | DELETE da propria linha | linhas=' || n::text);
    -- 2) INSERT de volta com role super-admin
    begin
      insert into public.profiles(id, role, status, full_name)
      values (a::uuid, 'super-admin', 'ativo', 'arnes');
      insert into _r(info) values ('DEPOIS | A | reinsere a propria linha como super-admin | PASSOU');
    exception when others then
      insert into _r(info) values ('DEPOIS | A | reinsere a propria linha como super-admin | BLOQUEADO ' || sqlstate);
    end;
    insert into _r(info)
    select 'DEPOIS | A | is_super_admin=' || public.is_super_admin()::text
           || ' is_admin_staff=' || public.is_admin_staff()::text;
  exception when others then
    insert into _r(info) values ('DEPOIS | A | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- 3) INSERT de linha para OUTRO id (policy de signup nao ancora o id)
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes injetado');
    insert into _r(info) values ('DEPOIS | A | injeta profile de OUTRO auth user (role=admin) | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A | injeta profile de OUTRO auth user | BLOQUEADO ' || sqlstate);
  end;

  -- 4) UPDATE tentando mudar o id da propria linha para outro usuario
  begin
    update public.profiles set id = outro::uuid where id = a::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('DEPOIS | A | UPDATE id -> outro usuario | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A | UPDATE id -> outro usuario | BLOQUEADO ' || sqlstate);
  end;

  -- 5) LEGITIMO: upsert do Settings.updateCompany
  begin
    insert into public.profiles(id, company_name, updated_at)
    values (a::uuid, 'Arnes Clinica', now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('DEPOIS | A | LEGITIMO upsert updateCompany | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A | LEGITIMO upsert updateCompany | QUEBROU ' || sqlstate);
  end;

  -- ---------- G: role agent ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', g, 'role', 'authenticated')::text);
  begin
    delete from public.profiles where id = g::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('DEPOIS | G (agent) | DELETE da propria linha | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | G (agent) | DELETE da propria linha | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- SEM PERFIL: usuario de auth sem linha em profiles ----------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', semp, 'role', 'authenticated')::text);
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'super-admin', 'ativo', 'arnes sem perfil');
    insert into _r(info) values ('DEPOIS | SEM PERFIL | cria a propria linha como super-admin | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | SEM PERFIL | cria a propria linha como super-admin | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.profiles(id, full_name) values (semp::uuid, 'arnes sem perfil');
    insert into _r(info)
    select 'DEPOIS | SEM PERFIL | cria a propria linha sem citar role | PASSOU, role nasceu='
           || coalesce(p.role, '-') || ' status=' || coalesce(p.status, '-')
    from public.profiles p where p.id = semp::uuid;
  exception when others then
    insert into _r(info) values ('DEPOIS | SEM PERFIL | cria a propria linha sem citar role | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- ANON ----------
  execute 'reset role';
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'pendente', 'arnes anon');
    insert into _r(info) values ('DEPOIS | ANON | injeta profile role=admin | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | ANON | injeta profile role=admin | BLOQUEADO ' || sqlstate);
  end;

  -- ---------- service_role ----------
  execute 'reset role';
  execute 'set local role service_role';
  begin
    insert into public.profiles(id, role, status, full_name)
    values (semp::uuid, 'admin', 'ativo', 'arnes service');
    insert into _r(info) values ('DEPOIS | service_role | cria profile com role | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | service_role | cria profile com role | QUEBROU ' || sqlstate);
  end;
  begin
    delete from public.profiles where id = semp::uuid;
    insert into _r(info) values ('DEPOIS | service_role | apaga profile | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | service_role | apaga profile | QUEBROU ' || sqlstate);
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

-- Estado final dos privilegios
insert into _r(info) select 'DEPOIS | GRANT TABELA | ' || grantee || ' | ' || string_agg(distinct privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') group by grantee;
insert into _r(info) select 'DEPOIS | GRANT INSERT COLUNA | ' || grantee || ' | ' || count(*)::text || ' colunas' from information_schema.column_privileges where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') and privilege_type = 'INSERT' group by grantee;

reset role;
select info from _r order by ord;

rollback;
