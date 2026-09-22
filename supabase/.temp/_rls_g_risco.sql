-- ITEM 6 / varredura G: só o que é ALCANÇÁVEL por anon/authenticated (policies
-- de service_role são irrelevantes — esse role já ignora RLS). Classifica pelo
-- que a expressão amarra e traz o tamanho real da tabela.
with pol as (
  select p.tablename, p.cmd, p.policyname,
         array_to_string(p.roles, ',') as roles,
         coalesce(p.qual, p.with_check, '') as expr,
         p.qual, p.with_check
  from pg_policies p
  where p.schemaname = 'public'
    and (p.roles && array['anon','authenticated','public']::name[])
)
select case
         when btrim(expr) = 'true' then '1_USING_TRUE'
         when expr ~ 'is_admin\(\)|is_supervisor\(\)' then '2_TENANT_CEGO'
         when expr !~ 'auth\.uid|get_owner_id|get_my_owner_id|user_id|owner_id|is_super_admin|admin_can|is_admin_staff|auth_user_id|created_by|assigned|contact_id|conversation_id|profile_id|team_member' then '3_SEM_ANCORA'
         else '4_OK'
       end as classe,
       tablename, cmd, roles, policyname,
       left(coalesce(qual, '(sem using)'), 200) as using_expr,
       left(coalesce(with_check, '-'), 100) as with_check
from pol
where case
         when btrim(expr) = 'true' then '1_USING_TRUE'
         when expr ~ 'is_admin\(\)|is_supervisor\(\)' then '2_TENANT_CEGO'
         when expr !~ 'auth\.uid|get_owner_id|get_my_owner_id|user_id|owner_id|is_super_admin|admin_can|is_admin_staff|auth_user_id|created_by|assigned|contact_id|conversation_id|profile_id|team_member' then '3_SEM_ANCORA'
         else '4_OK'
       end <> '4_OK'
order by classe, tablename, cmd;
