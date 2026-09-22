-- Dados para semear public.admin_users com o super-admin atual.
select info from (
  select 1 as ord, 'AUTH USER | id=' || u.id::text || ' email=' || coalesce(u.email, '-')
         || ' confirmado=' || (u.email_confirmed_at is not null)::text as info
  from auth.users u where u.id = '23da6832-ca42-4d5b-a59b-1aad8a6f3964'
  union all
  select 2, 'PROFILE | full_name=' || coalesce(p.full_name, '-')
         || ' email=' || coalesce(p.email, '-') || ' status=' || coalesce(p.status, '-')
  from public.profiles p where p.id = '23da6832-ca42-4d5b-a59b-1aad8a6f3964'
  union all
  select 3, 'CONSTRAINT admin_users | ' || conname || ' | ' || pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'public.admin_users'::regclass
  union all
  select 4, 'TRIGGER admin_users | ' || tg.tgname || ' | fn=' || pr.proname
  from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
  where tg.tgrelid = 'public.admin_users'::regclass and not tg.tgisinternal
  union all
  select 5, 'COL admin_users | ' || column_name || ' | ' || data_type
         || ' | notnull=' || (is_nullable = 'NO')::text
         || ' | default=' || coalesce(column_default, '-')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'admin_users'
  union all
  select 6, 'FN admin_2fa | ' || p.proname || ' | usa profiles.role=' ||
         (p.prosrc ~* 'super-admin')::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname like 'admin_2fa%'
  union all
  select 7, 'FN cita super-admin literal | ' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosrc ~* '''super-admin''' and p.proname <> 'is_super_admin'
  union all
  select 8, 'POLICY cita super-admin literal | ' || schemaname || '.' || tablename || ' | ' || policyname
  from pg_policies where coalesce(qual,'') || coalesce(with_check,'') ~* 'super-admin'
) s order by ord, info;
