-- GARANTIA 2: dono das tabelas e das funcoes SECURITY DEFINER. Uma funcao
-- SECURITY DEFINER roda com os privilegios do DONO; se o dono tiver BYPASSRLS,
-- a funcao nao e afetada por policy nenhuma (nem por FORCE RLS).
select 'tabelas por dono' as bloco, r.rolname as dono, count(*)::text as qtd
from pg_class c
join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
join pg_roles r on r.oid=c.relowner
where c.relkind='r'
group by r.rolname
union all
select 'funcoes secdef por dono', r.rolname, count(*)::text
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
join pg_roles r on r.oid=p.proowner
where p.prosecdef
group by r.rolname
union all
select 'triggers que chamam send_push_notification', t.tgname,
       c.relname || ' -> ' || p.proname
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal
  and p.prosrc like '%send_push_notification%'
union all
select 'funcoes que chamam send_push_notification', p.proname,
       case when p.prosecdef then 'SECDEF dono=' || r.rolname else 'invoker' end
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
join pg_roles r on r.oid=p.proowner
where p.prosrc like '%send_push_notification%' and p.proname <> 'send_push_notification';
