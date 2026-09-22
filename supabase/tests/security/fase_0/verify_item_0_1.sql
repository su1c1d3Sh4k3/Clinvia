-- DEPOIS da 0.1: quem ainda pode executar + prova funcional de que authenticated
-- toma 42501 e que service_role continua passando.
select 'EXECUTE | ' || coalesce((select r.rolname from pg_roles r where r.oid = a.grantee), 'PUBLIC') as info
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.proname = 'cleanup_team_member_data' and a.privilege_type = 'EXECUTE'
union all
select 'TESTE authenticated | ' || (
  select case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
              then 'AINDA PODE (FALHOU)' else 'BLOQUEADO (ok)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname='public'
  where p.proname='cleanup_team_member_data' limit 1)
union all
select 'TESTE anon | ' || (
  select case when has_function_privilege('anon', p.oid, 'EXECUTE')
              then 'AINDA PODE (FALHOU)' else 'BLOQUEADO (ok)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname='public'
  where p.proname='cleanup_team_member_data' limit 1)
union all
select 'TESTE service_role | ' || (
  select case when has_function_privilege('service_role', p.oid, 'EXECUTE')
              then 'PODE (ok, edge fn preservada)' else 'BLOQUEADO (FALHOU)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname='public'
  where p.proname='cleanup_team_member_data' limit 1)
order by 1;
