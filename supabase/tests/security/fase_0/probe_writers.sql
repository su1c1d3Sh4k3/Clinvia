-- RISCO REAL: trigger function NAO security definer, disparada por INSERT/UPDATE feito
-- pelo front (role authenticated), que escreve numa das 4 tabelas do lote => 42501 apos a
-- policy nova. Preciso saber quem escreve e com que privilegio.
select 'FN | ' || p.proname
       || ' | ' || case when p.prosecdef then 'SECDEF dono=' || r.rolname else 'INVOKER (RISCO)' end
       || ' | escreve=' || (case when p.prosrc ~* 'insert into\s+(public\.)?response_times|update\s+(public\.)?response_times' then 'response_times ' else '' end)
                       || (case when p.prosrc ~* 'insert into\s+(public\.)?groups|update\s+(public\.)?groups' then 'groups ' else '' end)
                       || (case when p.prosrc ~* 'insert into\s+(public\.)?group_members|update\s+(public\.)?group_members|delete from\s+(public\.)?group_members' then 'group_members ' else '' end)
                       || (case when p.prosrc ~* 'insert into\s+(public\.)?appointment_confirmation_sessions|update\s+(public\.)?appointment_confirmation_sessions' then 'acs ' else '' end) as info
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
join pg_roles r on r.oid = p.proowner
where p.prosrc ~* '(insert into|update|delete from)\s+(public\.)?(response_times|groups|group_members|appointment_confirmation_sessions)\b'
union all
select 'TRIGGER | ' || c.relname || ' -> ' || p.proname
       || ' | ' || case when p.prosecdef then 'SECDEF' else 'INVOKER' end
       || ' | ' || t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and p.prosrc ~* '(insert into|update|delete from)\s+(public\.)?(response_times|groups|group_members|appointment_confirmation_sessions)\b'
order by 1;
