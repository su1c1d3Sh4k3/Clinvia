-- =====================================================
-- Performance: Índices em Foreign Keys e Colunas Frequentes
-- =====================================================
-- Motivo: O Postgres NÃO cria índices automaticamente em foreign keys.
-- Sem esses índices, cada query filtrada por user_id/instance_id/etc
-- realiza um sequential scan — custo cresce linearmente com volume de dados.
-- As políticas RLS também dependem desses índices para filtrar por user_id.
-- =====================================================

-- ─── team_members ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON team_members(user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_auth_user_id
  ON team_members(auth_user_id);

-- Composto: lookup de permissões por papel (RLS + filtros de supervisão)
CREATE INDEX IF NOT EXISTS idx_team_members_user_role
  ON team_members(user_id, role);

-- ─── conversations ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_instance_id
  ON conversations(instance_id);

-- Composto: listagem de tickets por status (open/closed/pending) por usuário
CREATE INDEX IF NOT EXISTS idx_conversations_user_status
  ON conversations(user_id, status);

-- ─── contacts ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_instance_id
  ON contacts(instance_id);

-- Composto: busca de contatos por instância WhatsApp de um usuário
CREATE INDEX IF NOT EXISTS idx_contacts_user_instance
  ON contacts(user_id, instance_id);

-- ─── Módulo Financeiro ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_revenue_categories_user_id
  ON revenue_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_expense_categories_user_id
  ON expense_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_products_services_user_id
  ON products_services(user_id);

CREATE INDEX IF NOT EXISTS idx_professionals_user_id
  ON professionals(user_id);

-- ─── CRM / Oportunidades ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_deals_user_id
  ON crm_deals(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_deals_responsible_id
  ON crm_deals(responsible_id);

-- Nota: crm_deals usa stage_id (FK para crm_stages), não tem coluna status.
-- O índice composto por stage é coberto pelo FK index abaixo se necessário.

CREATE INDEX IF NOT EXISTS idx_opportunities_user_id
  ON opportunities(user_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to
  ON opportunities(assigned_to);

-- ─── Agendamentos ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON appointments(user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_professional_id
  ON appointments(professional_id);

-- Composto: agenda filtrada por profissional + status (confirmado/cancelado/etc)
CREATE INDEX IF NOT EXISTS idx_appointments_user_professional_status
  ON appointments(user_id, professional_id, status);

-- ─── Follow-ups ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_id
  ON follow_ups(user_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_team_member_id
  ON follow_ups(team_member_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_appointment_id
  ON follow_ups(appointment_id);

-- ─── Teams ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teams_user_id
  ON teams(user_id);
