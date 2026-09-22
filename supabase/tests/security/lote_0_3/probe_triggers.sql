-- Trigger que escreve em opportunities: e SECURITY DEFINER? em que tabela roda?
select 'TRG | ' || c.relname || ' | ' || tg.tgname || ' | fn=' || p.proname
       || ' | secdef=' || p.prosecdef::text as info
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_proc p on p.oid = tg.tgfoid
where not tg.tgisinternal and p.proname like '%opportunit%'
union all
select 'FN | get_global_metrics | secdef=' || prosecdef::text from pg_proc
where proname = 'get_global_metrics'
union all
select 'FN | ' || proname || ' | secdef=' || prosecdef::text from pg_proc
where proname in ('is_staff', 'is_admin_staff', 'get_owner_id');
