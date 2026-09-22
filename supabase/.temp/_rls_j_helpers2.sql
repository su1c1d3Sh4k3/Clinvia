-- ITEM 6 / varredura J: corpos das funcoes-guarda restantes + o with_check do
-- insert de participantes do chat interno (entrar no chat de outro tenant
-- daria leitura das mensagens via is_internal_chat_participant).
select p.proname, p.prosecdef as secdef,
       replace(p.prosrc, E'\n', ' ') as corpo
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
where p.proname in ('is_staff','is_agent','is_internal_chat_participant','is_group_hidden_for_me','is_super_admin')
order by p.proname;
