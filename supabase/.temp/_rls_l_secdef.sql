-- ITEM 6 / varredura L: funcoes SECURITY DEFINER executaveis por anon/authenticated
-- que recebem um id/uuid/text como argumento (candidatas a IDOR: passar o id de
-- outro tenant e receber os dados dele). Filtra as que o corpo NAO amarra em
-- auth.uid()/get_owner_id/admin_can.
select case when p.prosrc ~ 'auth\.uid|get_owner_id|get_my_owner_id|is_admin_staff|admin_can|is_super_admin|my_agent'
            then '4_ANCORADA' else '1_SEM_ANCORA' end as classe,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       array_to_string(array(
         select g.grantee from information_schema.role_routine_grants g
         where g.specific_name = p.proname || '_' || p.oid
           and g.grantee in ('anon','authenticated')
       ), ',') as quem_executa,
       length(p.prosrc) as tam_corpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosecdef
  and p.pronargs > 0
  and pg_get_function_identity_arguments(p.oid) ~* 'uuid|text|bigint|integer'
  and exists (
    select 1 from information_schema.role_routine_grants g
    where g.specific_name = p.proname || '_' || p.oid
      and g.grantee in ('anon','authenticated')
  )
order by classe, p.proname;
