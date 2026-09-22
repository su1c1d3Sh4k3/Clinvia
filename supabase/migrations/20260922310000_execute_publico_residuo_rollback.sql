-- Rollback da 20260922310000: devolve o EXECUTE a PUBLIC nas duas funcoes.
--
-- So usar se algum caminho nao mapeado depender de chamar como `anon`. O estado
-- que isto restaura e o estado INSEGURO de origem (PUBLIC = qualquer papel).
--
-- Uso: npx supabase db query --linked --file supabase/migrations/20260922310000_execute_publico_residuo_rollback.sql

grant execute on function public.admin_get_dashboard_metrics() to public;
grant execute on function public.enqueue_openai_provision() to public;

select 'FN | ' || p.proname
       || ' | public=' || has_function_privilege('public', p.oid, 'EXECUTE')::text as info
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_get_dashboard_metrics', 'enqueue_openai_provision')
order by 1;
