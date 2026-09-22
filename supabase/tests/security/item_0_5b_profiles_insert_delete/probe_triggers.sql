-- Itens 2 e 3 do bloqueante: INSERT/DELETE em profiles e escrita em admin_users.
select info from (
  select 1 as ord, 'COL profiles | ' || rpad(column_name, 28) || ' | notnull='
         || (is_nullable = 'NO')::text || ' | default=' || coalesce(column_default, '-') as info
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('id','role','status','email','full_name','created_at','markup')
  union all
  select 2, 'POLICY profiles | ' || rpad(policyname, 40) || ' | ' || cmd
         || ' | roles=' || array_to_string(roles, ',')
         || ' | using=' || coalesce(qual, '-')
         || ' | check=' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public' and tablename = 'profiles'
  union all
  select 3, 'GRANT TABELA profiles | ' || rpad(grantee, 16) || ' | '
         || string_agg(distinct privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'profiles'
    and grantee in ('anon','authenticated','service_role','PUBLIC')
  group by grantee
  union all
  select 4, 'GRANT INSERT COLUNA profiles | ' || grantee || ' | ' || count(*)::text || ' colunas'
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee in ('anon','authenticated') and privilege_type = 'INSERT'
  group by grantee
  union all
  -- Usuario autenticado SEM linha em profiles (persona do teste de INSERT).
  select 5, 'AUTH SEM PROFILE | ' || x.id::text || ' | ' || coalesce(x.email, '-')
  from (
    select u.id, u.email from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
    limit 3
  ) x
  union all
  select 6, 'AUTH SEM PROFILE | total=' || count(*)::text
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id)
) s order by ord, info;
