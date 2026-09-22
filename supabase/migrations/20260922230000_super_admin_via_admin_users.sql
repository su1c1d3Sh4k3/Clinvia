-- Fase 1 do plano de seguranca: o controle de SUPER ADMIN sai de
-- `public.profiles.role = 'super-admin'` e passa para `public.admin_users`.
--
-- POR QUE:
--   `profiles.role` e uma coluna da linha do proprio usuario. Ate 22/09 (item 0.5)
--   qualquer usuario logado escrevia nela e se promovia a super-admin. O revoke de
--   coluna fechou a porta, mas a autoridade continuava numa coluna de tenant.
--   `admin_users` e a tabela da equipe da plataforma: RLS permite escrita apenas a
--   quem ja e super admin, e nenhum tenant tem linha la.
--
-- ESTADO ANTES (probes em supabase/.temp/_f1_admin_probe.sql e _f1_inline.sql):
--   - `admin_users` tem 0 linhas; `is_admin_staff()` = `is_super_admin()` OR linha
--     ativa em admin_users ⇒ hoje o painel /admin depende SO de profiles.role.
--   - 1 super-admin: 23da6832-ca42-4d5b-a59b-1aad8a6f3964 (admin@clinbia.com).
--   - `is_super_admin()` le profiles.role.
--   - 4 policies em public + 1 em storage.objects repetem o predicado INLINE.
--   - 3 RPCs (admin_get_pending_profiles, admin_get_inactive_profiles,
--     admin_get_team_members) leem profiles.role do CHAMADOR.
--
-- O QUE NAO MUDA:
--   - `profiles.role` continua com o valor 'super-admin' (nada e apagado); ele
--     apenas deixa de ser fonte de autoridade. Por isso o front continua
--     funcionando sem republicacao: AdminAuth/useAdminUser olham profiles.role e
--     continuam achando o mesmo usuario, enquanto o banco passa a decidir por
--     admin_users.
--   - As referencias a 'super-admin' que falam do perfil ALVO (esconder a linha da
--     plataforma da lista de clientes em admin_get_all_profiles,
--     admin_get_dashboard_metrics, admin_list_client_options,
--     admin_can_access_client) ficam como estao: ali o valor e um marcador de
--     linha, nao uma permissao.
--   - service_role / crons / edge functions nao passam por nada disso.
--
-- Rollback: 20260922230000_super_admin_via_admin_users_rollback.sql

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) Marca de super admin na tabela da equipe do painel
-- ---------------------------------------------------------------------------
alter table public.admin_users
  add column if not exists is_super_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Semeia os super admins de hoje (vindos de profiles.role)
-- ---------------------------------------------------------------------------
insert into public.admin_users (
  auth_user_id, name, email, is_active, is_super_admin,
  client_scope, allowed_client_ids, permissions
)
select p.id,
       coalesce(nullif(p.full_name, ''), 'Super Admin'),
       coalesce(nullif(p.email, ''), u.email),
       true,
       true,
       'all',
       '{}'::uuid[],
       jsonb_build_object(
         'dashboard', 'edit', 'clientes', 'edit', 'monitoramento', 'edit',
         'equipe', 'edit', 'suporte', 'edit', 'system-prompt', 'edit',
         'atualizacoes', 'edit', 'design-login', 'edit'
       )
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'super-admin'
on conflict (auth_user_id) do update
  set is_super_admin = true,
      is_active      = true,
      client_scope   = 'all',
      permissions    = excluded.permissions,
      updated_at     = now();

-- Trava de seguranca: sem nenhum super admin semeado, trocar a funcao trancaria
-- a plataforma fora do proprio painel.
do $mig$
begin
  if not exists (
    select 1 from public.admin_users where is_super_admin and is_active
  ) then
    raise exception 'abortado: nenhum super admin ativo em admin_users apos o seed';
  end if;
end $mig$;

-- ---------------------------------------------------------------------------
-- 3) Fonte de verdade
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.admin_users a
     where a.auth_user_id = auth.uid()
       and a.is_active
       and a.is_super_admin
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 4) Policies que repetiam o predicado inline passam a chamar a funcao
-- ---------------------------------------------------------------------------
drop policy if exists "Super-admin full access pending signups" on public.pending_signups;
create policy "Super-admin full access pending signups"
  on public.pending_signups for all to authenticated
  using (public.is_super_admin());

drop policy if exists "system_updates_super_admin_write" on public.system_updates;
create policy "system_updates_super_admin_write"
  on public.system_updates for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Super-admin can view all token history" on public.token_monthly_history;
create policy "Super-admin can view all token history"
  on public.token_monthly_history for all to public
  using (public.is_super_admin());

drop policy if exists "Super-admin can view all token logs" on public.token_usage_log;
create policy "Super-admin can view all token logs"
  on public.token_usage_log for all to public
  using (public.is_super_admin());

-- Upload no bucket "media": mesma policy de 20260917170000, so troca o
-- `IN (select id from profiles where role='super-admin')` pela funcao.
drop policy if exists "Authenticated upload to own conversations" on storage.objects;
create policy "Authenticated upload to own conversations"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      case
        when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then exists (
            select 1 from public.conversations c
            where c.id = ((storage.foldername(name))[1])::uuid
              and c.user_id = (select public.get_my_owner_id())
          )
        else false
      end
      or public.is_super_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 5) RPCs que liam profiles.role do CHAMADOR
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_pending_profiles()
returns table(id uuid, full_name text, company_name text, email text, phone text,
              instagram text, address text, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_super_admin() then
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
begin
  if not public.is_super_admin() then
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
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super-admin role required';
  end if;

  return query
  select tm.id, tm.name, tm.role::text, tm.email, tm.phone
    from team_members tm
   where tm.user_id = p_user_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6) admin_users: nenhum cliente escreve nela
-- ---------------------------------------------------------------------------
-- Com a funcao lendo admin_users, a tabela passa a ser a raiz do privilegio da
-- plataforma. Confiar so em RLS aqui e fraco: UPDATE/DELETE sem policy casando
-- nao levantam erro, apenas afetam 0 linhas — e a policy admin_users_super_write
-- e FOR ALL, ou seja, quem virasse super admin poderia promover outros.
--
-- O navegador NUNCA escreve nesta tabela: AdminTeam.tsx so faz SELECT e manda
-- criar/editar/desativar pela edge fn `admin-create-user` (service_role, que
-- sanitiza permissions/escopo e nunca toca em is_super_admin). AdminAuth.tsx,
-- useAdminUser.ts, admin-2fa e _shared/admin-guard.ts tambem so leem.
--
-- Logo: authenticated fica somente com SELECT (o painel precisa ler a propria
-- linha) e anon perde tudo. Com isso INSERT, UPDATE e DELETE feitos com o token
-- do usuario retornam 42501 direto do privilegio, sem depender de RLS, e criar
-- um novo super admin exige migration deliberada no banco.
revoke all on public.admin_users from anon;
revoke insert, update, delete, truncate on public.admin_users from authenticated;

commit;
