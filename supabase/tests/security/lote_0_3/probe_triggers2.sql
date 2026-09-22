select 'TRG | ' || c.relname || ' | ' || tg.tgname || ' | fn=' || p.proname
       || ' | secdef=' || p.prosecdef::text as info
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_proc p on p.oid = tg.tgfoid
where not tg.tgisinternal and tg.tgname = 'trg_auto_lead_opportunities';
