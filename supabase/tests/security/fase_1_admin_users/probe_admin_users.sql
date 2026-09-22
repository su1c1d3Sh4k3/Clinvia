-- Fase 1: migrar o controle de super admin para public.admin_users.
-- Mapa: definicao das funcoes, policies/grants de admin_users, quem chama.
select info from (
  select 1 as ord, 'FN | ' || p.proname || ' | secdef=' || p.prosecdef::text
         || ' | owner=' || pg_get_userbyid(p.proowner)
         || ' | args=' || pg_get_function_identity_arguments(p.oid)
         || E'\n' || pg_get_functiondef(p.oid) as info
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname in ('is_super_admin', 'is_admin_staff', 'admin_can', 'is_staff')
  union all
  select 2, 'POLICY admin_users | ' || rpad(policyname, 40) || ' | ' || cmd
         || ' | roles=' || array_to_string(roles, ',')
         || ' | using=' || coalesce(qual, '-')
         || ' | check=' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public' and tablename = 'admin_users'
  union all
  select 3, 'RLS admin_users | rls=' || c.relrowsecurity::text
         || ' force=' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'admin_users'
  union all
  select 4, 'GRANT admin_users | ' || rpad(grantee, 16) || ' | '
         || string_agg(distinct privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'admin_users'
    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by grantee
  union all
  select 5, 'ADMIN_USERS linhas = ' || count(*)::text from public.admin_users
  union all
  select 6, 'SUPER-ADMIN em profiles | id=' || p.id::text
         || ' email=' || coalesce(p.email, '-')
         || ' nome=' || coalesce(p.full_name, '-')
  from public.profiles p where p.role = 'super-admin'
  union all
  select 7, 'DEFAULT permissions de admin_users | ' || coalesce(column_default, 'sem default')
         || ' | tipo=' || data_type || ' | notnull=' || (is_nullable = 'NO')::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'admin_users'
    and column_name = 'permissions'
  union all
  select 8, 'FN QUE USA is_super_admin | ' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosrc ~* 'is_super_admin' and p.proname <> 'is_super_admin'
  union all
  select 9, 'POLICY QUE USA is_super_admin/is_admin_staff | ' || schemaname || '.' || tablename
         || ' | ' || policyname
  from pg_policies
  where coalesce(qual, '') || coalesce(with_check, '') ~* 'is_super_admin|is_admin_staff'
) s
order by ord, info;
