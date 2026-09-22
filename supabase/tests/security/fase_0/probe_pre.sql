-- Estado EXATO antes do lote: policies das 4 tabelas + grant de execute da RPC #0.
-- Base para escrever o rollback fiel.
select 'POLICY | ' || tablename || ' | ' || policyname
       || ' | cmd=' || cmd
       || ' | ' || permissive
       || ' | roles=' || array_to_string(roles, ',')
       || ' | using=' || coalesce(qual, 'NULL')
       || ' | check=' || coalesce(with_check, 'NULL') as info
from pg_policies
where schemaname = 'public'
  and tablename in ('groups','group_members','appointment_confirmation_sessions','response_times')
union all
select 'RLS | ' || c.relname || ' | enabled=' || c.relrowsecurity || ' | forced=' || c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in ('groups','group_members','appointment_confirmation_sessions','response_times')
union all
select 'EXECUTE | ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') | '
       || coalesce((select r.rolname from pg_roles r where r.oid = a.grantee), 'PUBLIC')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.proname = 'cleanup_team_member_data' and a.privilege_type = 'EXECUTE'
order by 1;
