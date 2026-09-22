-- ITEM 6 / varredura K: volume real (count(*), n_live_tup mente sem ANALYZE)
-- das tabelas que vazam, + policies de internal_chats e o with_check dos
-- inserts abertos.
select 'appointment_confirmation_sessions' as tabela, count(*)::text as linhas from public.appointment_confirmation_sessions
union all select 'groups', count(*)::text from public.groups
union all select 'group_members', count(*)::text from public.group_members
union all select 'dados_atendimento', count(*)::text from public.dados_atendimento
union all select 'response_times', count(*)::text from public.response_times
union all select 'team_costs', count(*)::text from public.team_costs
union all select 'opportunities', count(*)::text from public.opportunities
union all select 'internal_chats', count(*)::text from public.internal_chats
union all select 'internal_messages', count(*)::text from public.internal_messages
union all select 'internal_chat_participants', count(*)::text from public.internal_chat_participants
union all select 'notifications', count(*)::text from public.notifications
union all select 'profiles', count(*)::text from public.profiles
union all select 'contas_distintas_groups', count(distinct user_id)::text from public.groups
union all select '-- internal_chats policies --', ''
union all select p.policyname || ' [' || p.cmd || '] ' || p.permissive,
                 coalesce(left(p.qual, 100), '(sem using)') || ' || wc=' || coalesce(left(p.with_check, 80), '-')
  from pg_policies p where p.schemaname='public' and p.tablename='internal_chats'
union all select '-- with_check dos inserts abertos --', ''
union all select p.tablename || '.' || p.policyname, coalesce(left(p.with_check, 120), '-')
  from pg_policies p where p.schemaname='public' and p.cmd='INSERT'
   and p.tablename in ('internal_chat_participants','internal_messages','groups','group_members','notifications','dados_atendimento');
