-- ITEM 6 / varredura H: para as tabelas suspeitas, o que importa de verdade —
-- a policy e PERMISSIVE ou RESTRICTIVE, quem tem grant, e ha alguma policy
-- permissiva de SELECT que ja limite o tenant.
select p.tablename,
       p.cmd,
       p.permissive,
       array_to_string(p.roles, ',') as roles,
       p.policyname,
       left(coalesce(p.qual, '(sem using)'), 90) as using_expr
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('appointment_confirmation_sessions','auto_message_logs','dados_atendimento',
                      'group_members','groups','llm_model_prices','login_design','notifications',
                      'response_times','service_applications','system_updates','conversations',
                      'internal_chat_participants','internal_messages','queues','team_costs',
                      'opportunities','custom_permissions','team_members')
order by p.tablename, p.permissive desc, p.cmd;
