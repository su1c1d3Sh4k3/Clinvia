-- Add stagnation_limit_days to crm_stages
ALTER TABLE crm_stages
ADD COLUMN stagnation_limit_days INTEGER DEFAULT 0;

-- Add stage_changed_at to crm_deals
ALTER TABLE crm_deals
ADD COLUMN stage_changed_at TIMESTAMPTZ DEFAULT NOW();

-- Create a function to update stage_changed_at
CREATE OR REPLACE FUNCTION update_stage_changed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        NEW.stage_changed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function
CREATE TRIGGER update_deal_stage_changed_at
BEFORE UPDATE ON crm_deals
FOR EACH ROW
EXECUTE FUNCTION update_stage_changed_at();
