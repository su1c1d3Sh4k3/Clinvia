-- VERIFY pos-apply da 20260922270000 (roda em PRODUCAO, so leitura).
select 'PRIV | authenticated pode SELECT provider_cost_usd = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'provider_cost_usd', 'SELECT')::text
       || ' (esperado false)' as info
union all
select 'PRIV | authenticated pode SELECT markup_applied = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'markup_applied', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT cost_usd_original = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'cost_usd_original', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT cost_brl_original = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'cost_brl_original', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT cache_ratio_applied = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'cache_ratio_applied', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT cost_brl (valor do cliente) = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'cost_brl', 'SELECT')::text
       || ' (esperado true)'
union all
select 'PRIV | authenticated pode SELECT total_tokens = ' ||
       has_column_privilege('authenticated', 'public.token_usage_log', 'total_tokens', 'SELECT')::text
       || ' (esperado true)'
union all
select 'PRIV | anon pode SELECT total_tokens = ' ||
       has_column_privilege('anon', 'public.token_usage_log', 'total_tokens', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT profiles.markup = ' ||
       has_column_privilege('authenticated', 'public.profiles', 'markup', 'SELECT')::text
       || ' (esperado false)'
union all
select 'PRIV | authenticated pode SELECT profiles.company_name = ' ||
       has_column_privilege('authenticated', 'public.profiles', 'company_name', 'SELECT')::text
       || ' (esperado true)'
union all
select 'PRIV | service_role pode SELECT provider_cost_usd = ' ||
       has_column_privilege('service_role', 'public.token_usage_log', 'provider_cost_usd', 'SELECT')::text
       || ' (esperado true)'
union all
select 'GUARDA | admin_get_openai_account_usage usa is_super_admin = ' ||
       (p.prosrc ilike '%is_super_admin()%')::text || ' | admin_can ainda presente = ' ||
       (p.prosrc ilike '%admin_can(%')::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_get_openai_account_usage'
union all
select 'RPCs DO CLIENTE | ' || p.proname || ' | secdef=' || p.prosecdef::text ||
       ' | owner=' || pg_get_userbyid(p.proowner)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_my_token_stats', 'get_my_token_monthly',
                    'get_my_token_daily', 'get_my_token_years')
order by 1;
