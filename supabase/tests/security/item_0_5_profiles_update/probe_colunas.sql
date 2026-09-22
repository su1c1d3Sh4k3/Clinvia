-- Item 0.5: escalonamento de privilegio via UPDATE na propria linha de profiles.
-- Mapa: colunas, policies, grants (tabela E coluna), triggers e quem mais escreve.
select info from (
  select 1 as ord, 'COLS | ' || string_agg(column_name, ', ' order by ordinal_position) as info
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
  union all
  select 2, 'POLICY | ' || rpad(policyname, 46) || ' | ' || cmd
         || ' | roles=' || array_to_string(roles, ',')
         || ' | ' || permissive
         || ' | using=' || coalesce(qual, '-')
         || ' | check=' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public' and tablename = 'profiles'
  union all
  select 3, 'RLS | profiles | rls=' || c.relrowsecurity::text || ' force=' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles'
  union all
  select 4, 'GRANT TABELA | ' || rpad(grantee, 16) || ' | '
         || string_agg(distinct privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by grantee
  union all
  select 5, 'GRANT COLUNA | ' || rpad(grantee, 16) || ' | ' || privilege_type || ' | '
         || string_agg(column_name, ',' order by column_name)
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by grantee, privilege_type
  union all
  select 6, 'TRIGGER | ' || tg.tgname || ' | fn=' || p.proname
         || ' | secdef=' || p.prosecdef::text
         || ' | tipo=' || tg.tgtype::text
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = tg.tgfoid
  where not tg.tgisinternal and n.nspname = 'public' and c.relname = 'profiles'
  union all
  select 7, 'ROLES EM USO | ' || coalesce(role, 'NULO') || ' = ' || count(*)::text
  from public.profiles group by role
) s
order by ord, info;
