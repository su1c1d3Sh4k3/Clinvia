-- GARANTIA 1: quem ignora RLS. Se service_role tem BYPASSRLS, NENHUMA mudanca de
-- policy alcanca edge function/cron (todos usam service_role). Se o owner das
-- funcoes SECURITY DEFINER nao tiver bypass, `force row level security` quebra.
-- Uma coluna textual so, pra nao depender da ordem das chaves no JSON do CLI.
select rolname || ' | super=' || rolsuper || ' | bypassrls=' || rolbypassrls
       || ' | login=' || rolcanlogin as info
from pg_roles
where rolname in ('anon','authenticated','service_role','postgres','supabase_admin',
                  'authenticator','supabase_auth_admin','supabase_storage_admin','pgbouncer')
order by rolname;
