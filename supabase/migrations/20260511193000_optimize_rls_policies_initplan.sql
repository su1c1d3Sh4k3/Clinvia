-- =====================================================
-- CRÍTICO: RLS policies wrappadas com (SELECT fn()) — initplan caching
-- =====================================================
-- Diagnóstico: pg_stat_statements mostrava useUnreadCounts respondendo
-- por 33% de TODO o tempo do banco (45.726 calls, mean 1232ms). Após
-- marcar funções helper como STABLE no commit anterior, o tempo da função
-- direta caiu para 2ms — mas as QUERIES com RLS continuaram lentas porque
-- as policies invocavam as helpers DIRETO em (user_id = get_owner_id()).
-- Postgres ainda re-avaliava a função uma vez por ROW.
--
-- Padrão recomendado oficial Supabase:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Wrappear em (SELECT fn()) faz o planner cachear o resultado como
-- "InitPlan" — UMA execução por query, não por row.
--
-- Medição useUnreadCounts:
--   Original (VOLATILE + direct call): 417 ms (Seq Scan + função por row)
--   Pós-STABLE (mas direct call):     1232 ms (ainda chamada por row em RLS)
--   Pós-(SELECT) wrap + índice:       4.27 ms  (Index Scan, função 1x/query)
--
-- Tabelas alteradas: contacts, messages, instances, queues, tags,
-- contact_tags, conversations (+ policy "Team members can view...").
-- =====================================================

DROP POLICY IF EXISTS contacts_all ON public.contacts;
CREATE POLICY contacts_all ON public.contacts
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS messages_all ON public.messages;
CREATE POLICY messages_all ON public.messages
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS instances_all ON public.instances;
CREATE POLICY instances_all ON public.instances
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS queues_all ON public.queues;
CREATE POLICY queues_all ON public.queues
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS tags_all ON public.tags;
CREATE POLICY tags_all ON public.tags
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS contact_tags_owner_access ON public.contact_tags;
CREATE POLICY contact_tags_owner_access ON public.contact_tags
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

DROP POLICY IF EXISTS conversations_all ON public.conversations;
CREATE POLICY conversations_all ON public.conversations
  USING (user_id = (SELECT get_owner_id()))
  WITH CHECK (user_id = (SELECT get_owner_id()));

-- Policy "Team members based on role" — usa EXISTS, mas auth.uid() chamado
-- por row também. Wrap.
DROP POLICY IF EXISTS "Team members can view conversations based on role" ON public.conversations;
CREATE POLICY "Team members can view conversations based on role" ON public.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_user_id = (SELECT auth.uid())
        AND tm.user_id = conversations.user_id
        AND (
          tm.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role])
          OR (tm.role = 'agent'::user_role AND (
            conversations.assigned_agent_id = tm.id
            OR (conversations.assigned_agent_id IS NULL AND conversations.status = 'pending')
          ))
        )
    )
  );

-- Índice parcial para acelerar useUnreadCounts (Seq Scan → Index Scan)
CREATE INDEX IF NOT EXISTS idx_conversations_unread_active
  ON public.conversations (unread_count, status)
  WHERE unread_count > 0 AND status IN ('open', 'pending');
