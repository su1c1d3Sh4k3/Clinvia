-- Garante no nível do banco que um contato nunca tenha 2+ cards ativos no CRM.
-- (Diagnóstico 2026-07-28: nenhum duplicado real existia; o "duplicado" era visual
-- no kanban — card desativado in-place mantinha stage não-terminal. Este índice
-- previne corrida real entre os múltiplos writers de crm_client.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_client_one_active_per_contact
  ON crm_client (contact_id)
  WHERE is_active = true;
