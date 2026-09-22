-- VERIFY do item 2: roda DEPOIS de aplicar a 20260922290000. Somente leitura.
select 'POLICY SELECT | ' || policyname || ' | roles=' || array_to_string(roles, ',') ||
       ' | using=' || coalesce(qual, '-') as info
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
union all
select 'ESPERADO | policy global "Users can view all profiles" sumiu = ' ||
       (not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'profiles'
                       and policyname = 'Users can view all profiles'))::text
union all
select 'ESPERADO | profiles_select_scoped existe = ' ||
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'profiles'
                  and policyname = 'profiles_select_scoped')::text
union all
select 'ESPERADO | anon sem SELECT em profiles = ' ||
       (not exists (select 1 from information_schema.column_privileges
                     where table_schema = 'public' and table_name = 'profiles'
                       and grantee = 'anon' and privilege_type = 'SELECT'))::text
union all
select 'GRANT SELECT authenticated | colunas=' || count(*)::text ||
       ' | margem/segredo de fora = ' ||
       (count(*) filter (where column_name in
         ('markup', 'openai_token', 'openai_api_key_id', 'openai_service_account_id',
          'n8n_openai_credential_id', 'n8n_openai_credential_name')) = 0)::text
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'SELECT'
union all
select 'RPC do cliente | ' || p.proname || ' | secdef=' || p.prosecdef::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.proname like 'get_my_token_stats%'
order by 1;
