-- Personas para o arnes do custo real: quem e super admin, quem e staff sem ser
-- super, e qual dono tem linhas de token_usage_log com provider_cost_usd.
select 'ADMIN_USERS | ' || coalesce(a.email, '-') ||
       ' | super=' || coalesce(a.is_super_admin::text, '-') ||
       ' | ativo=' || coalesce(a.is_active::text, '-') ||
       ' | auth_user_id=' || coalesce(a.auth_user_id::text, 'NULO') as info
from public.admin_users a
union all
select 'DEF is_super_admin | ' || pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_super_admin'
union all
select 'DONO COM CUSTO REAL | ' || coalesce(pr.company_name, left(t.owner_id::text, 8)) ||
       ' | ' || t.owner_id::text ||
       ' | linhas=' || count(*)::text ||
       ' | com provider_cost=' || count(*) filter (where t.provider_cost_usd is not null)::text
from public.token_usage_log t
left join public.profiles pr on pr.id = t.owner_id
group by t.owner_id, pr.company_name
order by 1;
