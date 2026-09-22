-- GARANTIA 4: o arnes nao persistiu nada. As policies antigas devem estar intactas.
select tablename || ' :: ' || policyname || ' :: ' || coalesce(qual,'-') as ainda_existe
from pg_policies
where schemaname='public' and tablename in ('groups','group_members','appointment_confirmation_sessions','response_times')
order by tablename, policyname;
