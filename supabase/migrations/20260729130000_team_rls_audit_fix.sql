-- Auditoria RLS 2026-07-29: tabelas de dados da clínica ainda usando
-- auth.uid() = user_id (invisíveis para supervisores/agentes).
-- Padrão correto: user_id = get_owner_id() (team-aware, como professionals).

-- ── CRM (crítico: kanban vazio para membros de equipe) ──
DROP POLICY IF EXISTS "Users manage own crm_client" ON crm_client;
CREATE POLICY "Team manage crm_client" ON crm_client
  FOR ALL USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id());

DROP POLICY IF EXISTS "Users manage own crm_client_history" ON crm_client_history;
CREATE POLICY "Team manage crm_client_history" ON crm_client_history
  FOR ALL USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id());

DROP POLICY IF EXISTS "Users manage own crm_client_services" ON crm_client_services;
CREATE POLICY "Team manage crm_client_services" ON crm_client_services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.id = crm_client_services.crm_client_id
        AND cc.user_id = get_owner_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_client cc
      WHERE cc.id = crm_client_services.crm_client_id
        AND cc.user_id = get_owner_id()
    )
  );

-- ── Documentos do cliente (aba Histórico do perfil) ──
DROP POLICY IF EXISTS "Users manage own client documents" ON client_documents;
CREATE POLICY "Team manage client documents" ON client_documents
  FOR ALL USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id());

-- ── Templates de mensagem (página Conexões > Templates) ──
DROP POLICY IF EXISTS "Users can view own templates" ON message_templates;
CREATE POLICY "Team can view templates" ON message_templates
  FOR SELECT USING (user_id = get_owner_id());
DROP POLICY IF EXISTS "Users can insert own templates" ON message_templates;
CREATE POLICY "Team can insert templates" ON message_templates
  FOR INSERT WITH CHECK (user_id = get_owner_id());
DROP POLICY IF EXISTS "Users can update own templates" ON message_templates;
CREATE POLICY "Team can update templates" ON message_templates
  FOR UPDATE USING (user_id = get_owner_id());
DROP POLICY IF EXISTS "Users can delete own templates" ON message_templates;
CREATE POLICY "Team can delete templates" ON message_templates
  FOR DELETE USING (user_id = get_owner_id());

-- ── Logs / automação (menor, mas mesmo padrão) ──
DROP POLICY IF EXISTS "ig_webhook_logs_owner_select" ON instagram_webhook_logs;
CREATE POLICY "ig_webhook_logs_team_select" ON instagram_webhook_logs
  FOR SELECT USING (user_id = get_owner_id());

DROP POLICY IF EXISTS "daj_owner" ON delivery_automation_jobs;
CREATE POLICY "daj_team" ON delivery_automation_jobs
  FOR ALL USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id());

DROP POLICY IF EXISTS "das_owner" ON delivery_automation_sessions;
CREATE POLICY "das_team" ON delivery_automation_sessions
  FOR ALL USING (user_id = get_owner_id()) WITH CHECK (user_id = get_owner_id());
