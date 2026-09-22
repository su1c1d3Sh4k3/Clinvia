-- ITEM 6 / varredura F: classifica TODA policy do schema public pelo que o USING
-- (e o WITH CHECK, no caso de INSERT) amarra.
--   1_USING_TRUE      -> nao filtra nada
--   2_TENANT_CEGO     -> chama is_admin()/is_supervisor(), que NAO filtram tenant
--   3_SEM_ANCORA      -> nao menciona auth.uid/get_owner_id/user_id/admin -> suspeita
--   4_OK              -> ancora em tenant ou em funcao de admin da plataforma
select case
         when coalesce(btrim(p.qual), btrim(p.with_check), '') = 'true' then '1_USING_TRUE'
         when coalesce(p.qual, p.with_check, '') ~ 'is_admin\(\)|is_supervisor\(\)' then '2_TENANT_CEGO'
         when coalesce(p.qual, p.with_check, '') !~ 'auth\.uid|get_owner_id|get_my_owner_id|user_id|owner_id|is_super_admin|admin_can|is_admin_staff|auth_user_id|created_by|assigned|contact_id|conversation_id' then '3_SEM_ANCORA'
         else '4_OK'
       end as classe,
       p.tablename, p.cmd, p.policyname,
       array_to_string(p.roles, ',') as roles,
       left(coalesce(p.qual, '(null)'), 220) as using_expr,
       left(coalesce(p.with_check, '-'), 120) as with_check
from pg_policies p
where p.schemaname = 'public'
order by classe, p.tablename, p.cmd;
