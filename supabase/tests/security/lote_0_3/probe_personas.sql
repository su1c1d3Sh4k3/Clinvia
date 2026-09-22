-- Personas do arnes do lote 0.3: quem e admin_staff, e onde estao as linhas.
select info from (
  select 1 as ord, 'ADMIN_USERS cols | ' || string_agg(column_name, ',' order by ordinal_position) as info
  from information_schema.columns
  where table_schema = 'public' and table_name = 'admin_users'
  union all
  select 2, 'IS_ADMIN_STAFF def | ' || replace(pg_get_functiondef(p.oid), E'\n', ' ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_admin_staff'
  union all
  select 3, 'IS_STAFF def | ' || replace(pg_get_functiondef(p.oid), E'\n', ' ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_staff'
  union all
  select 4, 'OPP por user_id | ' || coalesce(user_id::text, 'NULO') || ' = ' || count(*)::text
  from public.opportunities group by user_id
  union all
  select 5, 'NOTIF por user_id (top 3) | ' || user_id::text || ' = ' || n::text
  from (select user_id, count(*) as n from public.notifications group by user_id
        order by count(*) desc limit 3) x
  union all
  select 6, 'NOTIF do tenant A = ' || count(*)::text from public.notifications
  where user_id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af'
  union all
  select 7, 'NOTIF do tenant B = ' || count(*)::text from public.notifications
  where user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
  union all
  select 8, 'NOTIF cols | ' || string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'notifications'
  union all
  select 9, 'BACKUP por user_id | ' || coalesce(user_id::text, 'NULO') || ' = ' || count(*)::text
  from public.contacts_merge_backup_20260901 group by user_id
  union all
  select 10, 'SPLIT_AUDIT por user_id | ' || coalesce(user_id::text, 'NULO') || ' = ' || count(*)::text
  from public.crm_client_channel_split_audit group by user_id
) s
order by ord, info;
