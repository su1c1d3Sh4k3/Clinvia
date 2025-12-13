-- Add history counter to crm_stages
-- This field counts how many deals have progressed INTO this stage from a previous stage

ALTER TABLE public.crm_stages
ADD COLUMN IF NOT EXISTS history INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_crm_stages_history ON public.crm_stages(history);

COMMENT ON COLUMN public.crm_stages.history IS 'Counter for deals that have progressed into this stage from a previous (left) stage. Does not count backwards movements.';
