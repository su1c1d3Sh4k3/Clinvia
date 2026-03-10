-- Migration: crm_deal_history
-- Tabela de histórico de movimentações de negociações + trigger automático

CREATE TABLE IF NOT EXISTS crm_deal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_history_deal ON crm_deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_history_created ON crm_deal_history(created_at DESC);

ALTER TABLE crm_deal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own deal history"
  ON crm_deal_history
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger para registrar mudanças automáticas
CREATE OR REPLACE FUNCTION record_deal_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO crm_deal_history(deal_id, user_id, event_type, old_value, new_value)
    VALUES (NEW.id, NEW.user_id, 'stage_change', OLD.stage_id::TEXT, NEW.stage_id::TEXT);
  END IF;
  IF OLD.funnel_id IS DISTINCT FROM NEW.funnel_id THEN
    INSERT INTO crm_deal_history(deal_id, user_id, event_type, old_value, new_value)
    VALUES (NEW.id, NEW.user_id, 'funnel_change', OLD.funnel_id::TEXT, NEW.funnel_id::TEXT);
  END IF;
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO crm_deal_history(deal_id, user_id, event_type, old_value, new_value)
    VALUES (NEW.id, NEW.user_id, 'field_update', OLD.value::TEXT, NEW.value::TEXT,
            jsonb_build_object('field', 'value'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_history ON crm_deals;
CREATE TRIGGER trg_deal_history
  AFTER UPDATE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION record_deal_history();
