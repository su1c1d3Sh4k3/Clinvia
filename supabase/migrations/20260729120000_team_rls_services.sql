-- Bug: supervisor não vê serviços cadastrados pelo admin.
-- services_client/service_name usavam auth.uid() = user_id no RLS, mas membros
-- de equipe têm auth uid próprio — só o dono via os registros. Corrige para
-- get_owner_id() (mesmo padrão de professionals).

DROP POLICY IF EXISTS "Users manage own client services" ON services_client;
CREATE POLICY "Team manage client services" ON services_client
  FOR ALL
  USING (user_id = get_owner_id())
  WITH CHECK (user_id = get_owner_id());

DROP POLICY IF EXISTS "Read template and own service names" ON service_name;
CREATE POLICY "Read template and team service names" ON service_name
  FOR SELECT
  USING (user_id IS NULL OR user_id = get_owner_id());

DROP POLICY IF EXISTS "Users manage own service names" ON service_name;
CREATE POLICY "Team insert service names" ON service_name
  FOR INSERT
  WITH CHECK (user_id = get_owner_id());

DROP POLICY IF EXISTS "Users update own service names" ON service_name;
CREATE POLICY "Team update service names" ON service_name
  FOR UPDATE
  USING (user_id = get_owner_id());

DROP POLICY IF EXISTS "Users delete own service names" ON service_name;
CREATE POLICY "Team delete service names" ON service_name
  FOR DELETE
  USING (user_id = get_owner_id());
