-- O lote 1 (#4/#2/#7) ja esta em producao? Lista as policies das 4 tabelas.
select t.tablename || ' | ' || coalesce(p.policyname, '(SEM POLICY)')
       || ' | cmd=' || coalesce(p.cmd, '-')
       || ' | roles=' || coalesce(array_to_string(p.roles, ','), '-')
       || ' | using=' || coalesce(p.qual, 'NULL') as estado
from (values ('groups'),('group_members'),('appointment_confirmation_sessions'),('response_times')) t(tablename)
left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tablename
order by 1;
