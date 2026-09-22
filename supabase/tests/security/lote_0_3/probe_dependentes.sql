-- Quem referencia, por NOME, os objetos que vao mudar de schema/policy.
-- Mover tabela de schema quebra funcao/view que a chama sem qualificar.
select info from (
  select 1 as ord, 'FUNCAO cita | ' || p.proname || ' | ' || t.alvo as info
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  cross join (values ('contacts_merge_backup_20260901'), ('crm_client_channel_split_audit'),
                     ('_reminder_log'), ('opportunities'), ('dados_atendimento'),
                     ('llm_model_prices'), ('team_costs')) t(alvo)
  where p.prosrc like '%' || t.alvo || '%'
  union all
  select 2, 'VIEW cita | ' || c.relname || ' | ' || t.alvo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  cross join (values ('contacts_merge_backup_20260901'), ('crm_client_channel_split_audit'),
                     ('_reminder_log'), ('opportunities'), ('dados_atendimento'),
                     ('llm_model_prices'), ('team_costs')) t(alvo)
  where c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) like '%' || t.alvo || '%'
  union all
  select 3, 'FK aponta para | ' || conrelid::regclass::text || ' -> ' || confrelid::regclass::text
  from pg_constraint
  where contype = 'f'
    and confrelid::regclass::text in ('contacts_merge_backup_20260901', 'crm_client_channel_split_audit',
                                      '_reminder_log', 'opportunities', 'dados_atendimento',
                                      'llm_model_prices', 'team_costs')
  union all
  select 4, 'TRIGGER em | ' || c.relname || ' | ' || tg.tgname
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  where not tg.tgisinternal
    and c.relname in ('contacts_merge_backup_20260901', 'crm_client_channel_split_audit',
                      '_reminder_log', 'opportunities', 'dados_atendimento',
                      'llm_model_prices', 'team_costs')
  union all
  select 5, 'LINHAS | contacts_merge_backup_20260901 = ' || count(*)::text
  from public.contacts_merge_backup_20260901
  union all
  select 6, 'LINHAS | crm_client_channel_split_audit = ' || count(*)::text
  from public.crm_client_channel_split_audit
  union all
  select 7, 'LINHAS | _reminder_log = ' || count(*)::text from public._reminder_log
  union all
  select 8, 'LINHAS | opportunities = ' || count(*)::text from public.opportunities
  union all
  select 9, 'LINHAS | dados_atendimento = ' || count(*)::text from public.dados_atendimento
  union all
  select 10, 'LINHAS | team_costs = ' || count(*)::text from public.team_costs
  union all
  select 11, 'LINHAS | llm_model_prices = ' || count(*)::text from public.llm_model_prices
  union all
  select 12, 'LINHAS | notifications = ' || count(*)::text from public.notifications
) s
order by ord, info;
