create temp table _r(ord int, info text);

insert into _r
select 1, 'ASSINATURA | ' || p.oid::regprocedure::text
  || ' | security=' || case when p.prosecdef then 'definer' else 'invoker' end
  || ' | search_path=' || coalesce(array_to_string(p.proconfig, ','), '(nenhum)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'send_push_notification';

insert into _r
select 2, 'GRANT EXECUTE | ' || coalesce(a.grantee, '(nenhum)')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) ac
join lateral (select pg_get_userbyid(ac.grantee) as grantee) a on true
where n.nspname = 'public' and p.proname = 'send_push_notification'
  and ac.privilege_type = 'EXECUTE';

insert into _r
select 3, 'CHAMADOR FUNCAO | ' || n.nspname || '.' || p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prokind in ('f', 'p')
  and p.proname <> 'send_push_notification'
  and coalesce(p.prosrc, '') like '%send_push_notification%';

insert into _r
select 4, 'CHAMADOR TRIGGER | ' || c.relname || ' | ' || t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and coalesce(p.prosrc, '') like '%send_push_notification%';

insert into _r
select 5, 'GUC app.settings.supabase_url | '
  || coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '(nao configurada)');

insert into _r
select 6, 'GUC app.settings.service_role_key | '
  || case when coalesce(current_setting('app.settings.service_role_key', true), '') = ''
          then '(nao configurada)' else '(preenchida)' end;

insert into _r select 7, 'TOTAL CHAMADORES REAIS | ' || (
  select count(*) from (
    select 1 from pg_proc p
     where p.prokind in ('f','p') and p.proname <> 'send_push_notification'
       and coalesce(p.prosrc,'') like '%send_push_notification%'
    union all
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where not t.tgisinternal and coalesce(p.prosrc,'') like '%send_push_notification%'
  ) s
)::text;

select info from _r order by ord, info;
