-- ITEM 6 / varredura I: grants reais + tamanho das tabelas suspeitas. Policy
-- permissiva so vaza se o role tiver GRANT na tabela.
select c.relname as tabela,
       coalesce(g.roles, '(sem grant p/ anon/auth)') as grants,
       (select count(*) from information_schema.columns ic
         where ic.table_schema='public' and ic.table_name=c.relname
           and ic.column_name in ('user_id','owner_id')) as tem_col_tenant
from pg_class c
join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
left join (
  select t.table_name, string_agg(distinct t.grantee||':'||t.privilege_type, ' ' order by t.grantee||':'||t.privilege_type) as roles
  from information_schema.role_table_grants t
  where t.table_schema='public' and t.grantee in ('anon','authenticated')
    and t.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
  group by t.table_name
) g on g.table_name=c.relname
where c.relkind='r'
  and c.relname in ('appointment_confirmation_sessions','auto_message_logs','dados_atendimento',
                    'group_members','groups','llm_model_prices','login_design','notifications',
                    'response_times','service_applications','system_updates','team_costs',
                    'opportunities','internal_chat_participants','internal_messages','internal_chats')
order by c.relname;
