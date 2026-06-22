-- =============================================
-- Migration: Sistema de Follow-Up IA
-- 1. Adaptar colunas de contato (last_message, last_message_time)
-- 2. Trigger para sincronizar contacts.ia_on com crm_client.stage
-- 3. Indice de performance para query de follow-up
-- Data: 2026-06-22
-- =============================================

-- ─── 1. Renomear colunas existentes (não usadas em nenhum lugar) ───

-- follow_status -> last_message ('enviada' / 'recebida')
ALTER TABLE contacts RENAME COLUMN follow_status TO last_message;

-- message_date -> last_message_time (timestamptz para queries temporais)
ALTER TABLE contacts DROP COLUMN IF EXISTS message_date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_time TIMESTAMPTZ;

-- Remover follow_stage (não é mais necessário)
ALTER TABLE contacts DROP COLUMN IF EXISTS follow_stage;

-- Remover indices antigos dessas colunas
DROP INDEX IF EXISTS idx_contacts_follow_status;
DROP INDEX IF EXISTS idx_contacts_follow_stage;

-- ─── 2. Backfill last_message e last_message_time com dados existentes ───
-- Usa conversations.last_message_direction e conversations.last_message_at

UPDATE contacts c SET
  last_message = CASE
    WHEN conv.last_message_direction = 'outbound' THEN 'enviada'
    WHEN conv.last_message_direction = 'inbound' THEN 'recebida'
    ELSE NULL
  END,
  last_message_time = conv.last_message_at
FROM (
  SELECT DISTINCT ON (contact_id)
    contact_id,
    last_message_direction,
    last_message_at
  FROM conversations
  WHERE contact_id IS NOT NULL
  ORDER BY contact_id, updated_at DESC
) conv
WHERE c.id = conv.contact_id;

-- ─── 3. Trigger: sincronizar contacts.ia_on com crm_client.stage ───

CREATE OR REPLACE FUNCTION sync_contact_ia_on_from_crm()
RETURNS TRIGGER AS $$
DECLARE
  v_ia_on BOOLEAN;
BEGIN
  -- Determinar o valor de ia_on baseado no novo stage
  IF NEW.stage IN ('Em Atendimento Humano', 'Suporte', 'Financeiro', 'Pós-Venda') THEN
    v_ia_on := FALSE;
  ELSE
    -- Em Atendimento IA, Qualificado, Agendado, Recorrencia,
    -- Sem Contato, Sem Interesse, Follow Up, Ganho, Perdido, Finalizado
    v_ia_on := TRUE;
  END IF;

  -- Só atualizar se o stage realmente mudou
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    UPDATE contacts
    SET ia_on = v_ia_on, updated_at = NOW()
    WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger antigo se existir e recriar
DROP TRIGGER IF EXISTS trg_sync_contact_ia_on ON crm_client;

CREATE TRIGGER trg_sync_contact_ia_on
  AFTER UPDATE ON crm_client
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_ia_on_from_crm();

-- ─── 4. Indice parcial para query de follow-up pendente ───

CREATE INDEX IF NOT EXISTS idx_contacts_followup_pending
  ON contacts (user_id, last_message_time)
  WHERE ia_on = true AND last_message = 'enviada';

-- ─── 5. RPC: buscar contatos pendentes de follow-up ───

CREATE OR REPLACE FUNCTION get_followup_pending_contacts(
  p_user_id UUID,
  p_minutes INTEGER
)
RETURNS TABLE (
  id UUID,
  number TEXT,
  push_name TEXT,
  last_message TEXT,
  last_message_time TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.number,
    c.push_name,
    c.last_message,
    TO_CHAR(
      c.last_message_time AT TIME ZONE 'America/Sao_Paulo',
      'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
    ) AS last_message_time
  FROM contacts c
  WHERE c.user_id = p_user_id
    AND c.ia_on = TRUE
    AND c.last_message = 'enviada'
    AND c.is_group = FALSE
    AND c.last_message_time < (NOW() - (p_minutes || ' minutes')::INTERVAL);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 6. Verificação ───
DO $$
DECLARE
  v_total INTEGER;
  v_with_time INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM contacts;
  SELECT COUNT(*) INTO v_with_time FROM contacts WHERE last_message_time IS NOT NULL;
  RAISE NOTICE 'Migration followup_ia_system: % contacts total, % with last_message_time backfilled', v_total, v_with_time;
END $$;
