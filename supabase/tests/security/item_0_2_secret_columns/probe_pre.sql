-- PRE-APPLY do bloqueio das colunas de segredo de profiles (20260922133000).
-- Procura caminhos que continuariam vazando openai_token depois do revoke de coluna:
-- views (rodam com o privilegio do DONO), funcoes NAO-security-definer e o estado atual
-- dos grants. Somente leitura.

select 1 as ord,
       'GRANT ATUAL | ' || pg_get_userbyid(ac.grantee) || ' | ' || ac.privilege_type
       || ' | colunas=' || case when ac.privilege_type = 'SELECT' then 'tabela inteira' else '-' end as info
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) ac
where n.nspname = 'public' and c.relname = 'profiles'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated')

union all
select 2, 'GRANT DE COLUNA SECRETA | ' || a.attname || ' | ' || pg_get_userbyid(ac.grantee)
          || ' | ' || ac.privilege_type
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(a.attacl) ac
where a.attacl is not null
  and n.nspname = 'public' and c.relname = 'profiles'
  and a.attname in ('openai_token','openai_api_key_id','openai_service_account_id')
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated')

union all
-- View que cite profiles: view roda com o privilegio do DONO (postgres) e furaria o revoke.
select 3, 'VIEW SOBRE PROFILES | ' || n.nspname || '.' || c.relname
          || ' | dono=' || pg_get_userbyid(c.relowner)
          || ' | cita token=' || (pg_get_viewdef(c.oid) like '%openai_token%')::text
          || ' | front pode ler=' || has_table_privilege('authenticated', c.oid, 'SELECT')::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v','m')
  and pg_get_viewdef(c.oid) like '%profiles%'

union all
-- Funcao que leia as colunas secretas SEM ser security definer roda como o chamador
-- e passaria a falhar depois do revoke.
select 4, 'FUNCAO QUE LE COLUNA SECRETA | ' || p.proname
          || ' | definer=' || p.prosecdef::text
          || ' | dono=' || pg_get_userbyid(p.proowner)
          || ' | anon exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
          || ' | auth exec=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f','p')
  and coalesce(p.prosrc, '') like '%openai_token%'

order by 1, 2;
