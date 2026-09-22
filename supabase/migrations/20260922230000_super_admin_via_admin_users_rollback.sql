-- Rollback de 20260922230000_super_admin_via_admin_users.sql
-- Devolve a autoridade de super admin para public.profiles.role.
--
-- NAO apaga a linha semeada em admin_users nem a coluna is_super_admin (dado);
-- apenas volta as funcoes e policies ao estado anterior. Se quiser tirar a
-- coluna tambem, ver o bloco comentado no fim.

begin;

set local lock_timeout = '5s';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'super-admin'
  );
$fn$;

drop policy if exists "Super-admin full access pending signups" on public.pending_signups;
create policy "Super-admin full access pending signups"
  on public.pending_signups for all to authenticated
  using (exists (
    select 1 from profiles
     where profiles.id = auth.uid() and profiles.role = 'super-admin'
  ));

drop policy if exists "system_updates_super_admin_write" on public.system_updates;
create policy "system_updates_super_admin_write"
  on public.system_updates for all to authenticated
  using (exists (
    select 1 from profiles
     where profiles.id = auth.uid() and profiles.role = 'super-admin'
  ))
  with check (exists (
    select 1 from profiles
     where profiles.id = auth.uid() and profiles.role = 'super-admin'
  ));

drop policy if exists "Super-admin can view all token history" on public.token_monthly_history;
create policy "Super-admin can view all token history"
  on public.token_monthly_history for all to public
  using (exists (
    select 1 from profiles
     where profiles.id = auth.uid() and profiles.role = 'super-admin'
  ));

drop policy if exists "Super-admin can view all token logs" on public.token_usage_log;
create policy "Super-admin can view all token logs"
  on public.token_usage_log for all to public
  using (exists (
    select 1 from profiles
     where profiles.id = auth.uid() and profiles.role = 'super-admin'
  ));

-- Volta a policy de upload exatamente como em 20260917170000.
drop policy if exists "Authenticated upload to own conversations" on storage.objects;
create policy "Authenticated upload to own conversations"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      case
        when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then exists (
            select 1 from conversations c
            where c.id = ((storage.foldername(name))[1])::uuid
              and c.user_id = (select get_my_owner_id())
          )
        else false
      end
      or (select auth.uid()) in (select p.id from profiles p where p.role = 'super-admin')
    )
  );

create or replace function public.admin_get_pending_profiles()
returns table(id uuid, full_name text, company_name text, email text, phone text,
              instagram text, address text, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caller_role text;
begin
  select p.role into v_caller_role from profiles p where p.id = auth.uid();

  if v_caller_role != 'super-admin' then
    raise exception 'Access denied: super-admin role required';
  end if;

  return query
  select ps.id, ps.full_name, ps.company_name, ps.email, ps.phone,
         ps.instagram, ps.address, ps.created_at
    from pending_signups ps
   where ps.status = 'pendente'
   order by ps.created_at desc;
end;
$fn$;

create or replace function public.admin_get_inactive_profiles()
returns table(id uuid, full_name text, company_name text, email text, phone text,
              instagram text, address text, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caller_role text;
begin
  select p.role into v_caller_role from profiles p where p.id = auth.uid();

  if v_caller_role != 'super-admin' then
    raise exception 'Access denied: super-admin role required';
  end if;

  return query
  select ps.id, ps.full_name, ps.company_name, ps.email, ps.phone,
         ps.instagram, ps.address, ps.created_at
    from pending_signups ps
   where ps.status = 'rejeitado'
   order by ps.created_at desc;
end;
$fn$;

create or replace function public.admin_get_team_members(p_user_id uuid)
returns table(id uuid, name text, role text, email text, phone text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caller_role text;
begin
  select p.role into v_caller_role from profiles p where p.id = auth.uid();

  if v_caller_role != 'super-admin' then
    raise exception 'Access denied: super-admin role required';
  end if;

  return query
  select tm.id, tm.name, tm.role::text, tm.email, tm.phone
    from team_members tm
   where tm.user_id = p_user_id;
end;
$fn$;

grant all on public.admin_users to anon;
grant insert, update, delete, truncate on public.admin_users to authenticated;

commit;

-- Opcional (descarta o dado da marca):
--   alter table public.admin_users drop column is_super_admin;
