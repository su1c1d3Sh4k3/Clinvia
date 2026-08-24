-- PERF inbox: lista de conversas levava 3-8s em produção para membros de equipe.
--
-- Causa raiz (EXPLAIN como agente PELE): a policy permissiva LEGADA
-- "Team members can view conversations based on role" tem um EXISTS em
-- team_members avaliado POR LINHA. Como o único índice usável era
-- idx_conversations_status, o scan percorria linhas de TODOS os tenants
-- (4.494 pending) e o SubPlan rodava 3.087x (~380ms de 534ms totais) — sob
-- concorrência (11 membros no tenant + refetch) virava os 3-8s dos logs.
--
-- A policy é REDUNDANTE desde a adoção de get_owner_id() (e3a9622) +
-- policies RESTRITIVAS de agente (2697b38/bae96bd):
--   - conversations_all (permissiva): user_id = get_owner_id() já concede
--     acesso a TODOS os membros (a função mapeia auth→owner via team_members);
--     o predicado legado exige tm.user_id = conversations.user_id, ou seja,
--     concede um SUBCONJUNTO do que conversations_all já concede.
--   - as regras de agente (atribuída/pending) são exatamente o que
--     conversations_agent_assignment (RESTRICTIVE) impõe hoje.
-- Removê-la não muda o conjunto visível de ninguém — só elimina o EXISTS.
--
-- Índice composto: com o filtro RLS reduzido a user_id = get_owner_id()
-- (InitPlan), o planner passa a navegar direto no tenant.
set lock_timeout = '5s';

drop policy if exists "Team members can view conversations based on role" on public.conversations;

create index if not exists idx_conversations_user_status_lastmsg
  on public.conversations (user_id, status, last_message_at desc);
