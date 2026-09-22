-- Estado atual dos objetos do lote 0.3 (#3, #6, #11, #12): RLS ligada?,
-- policies, grants por role, colunas de ancoragem e volume.
with alvos(t) as (
  values ('contacts_merge_backup_20260901'), ('crm_client_channel_split_audit'),
         ('team_costs'), ('opportunities'), ('notifications'),
         ('dados_atendimento'), ('_reminder_log'), ('llm_model_prices')
)
select info from (
  select 1 as ord, 'SCHEMA private existe = '
         || (exists (select 1 from pg_namespace where nspname = 'private'))::text as info
  union all
  select 2, 'TABELA | ' || rpad(a.t, 34) || ' | existe=' || (c.oid is not null)::text
         || ' | rls=' || coalesce(c.relrowsecurity::text, '-')
         || ' | force=' || coalesce(c.relforcerowsecurity::text, '-')
  from alvos a
  left join pg_class c on c.relname = a.t
       and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 3, 'POLICY | ' || rpad(p.tablename, 34) || ' | ' || rpad(p.policyname, 46)
         || ' | ' || p.cmd || ' | roles=' || array_to_string(p.roles, ',')
         || ' | permissive=' || p.permissive
         || ' | using=' || coalesce(p.qual, '-')
         || ' | check=' || coalesce(p.with_check, '-')
  from pg_policies p join alvos a on a.t = p.tablename
  where p.schemaname = 'public'
  union all
  select 4, 'GRANT | ' || rpad(g.table_name, 34) || ' | ' || rpad(g.grantee, 16)
         || ' | ' || string_agg(distinct g.privilege_type, ',' order by g.privilege_type)
  from information_schema.role_table_grants g join alvos a on a.t = g.table_name
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by g.table_name, g.grantee
  union all
  select 5, 'COLUNA | ' || rpad(c.table_name, 34) || ' | ' || c.column_name
  from information_schema.columns c join alvos a on a.t = c.table_name
  where c.table_schema = 'public' and c.column_name in ('user_id', 'owner_id', 'auth_user_id')
) s
order by ord, info;
