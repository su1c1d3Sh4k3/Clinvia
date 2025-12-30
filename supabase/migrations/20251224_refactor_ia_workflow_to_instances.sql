-- Migration: Move workflow_id to instances and refactor IA toggle logic
-- 1. Add workflow_id to instances
-- 2. Add workflow_id to instagram_instances
-- 3. Change default of ia_on_wpp to FALSE
-- 4. Change default of ia_on_insta to FALSE
-- 5. Remove workflow_id from ia_config

-- =============================================
-- PART 1: ADD workflow_id TO instances
-- =============================================
ALTER TABLE instances ADD COLUMN IF NOT EXISTS workflow_id TEXT;

-- =============================================
-- PART 2: ADD workflow_id TO instagram_instances
-- =============================================
ALTER TABLE instagram_instances ADD COLUMN IF NOT EXISTS workflow_id TEXT;

-- =============================================
-- PART 3: CHANGE DEFAULT OF ia_on_wpp TO FALSE
-- =============================================
-- Change default for new records
ALTER TABLE instances ALTER COLUMN ia_on_wpp SET DEFAULT FALSE;

-- Update existing records to FALSE (so they start OFF when user toggles IA on)
UPDATE instances SET ia_on_wpp = FALSE WHERE ia_on_wpp = TRUE;

-- =============================================
-- PART 4: CHANGE DEFAULT OF ia_on_insta TO FALSE
-- =============================================
-- Change default for new records
ALTER TABLE instagram_instances ALTER COLUMN ia_on_insta SET DEFAULT FALSE;

-- Update existing records to FALSE
UPDATE instagram_instances SET ia_on_insta = FALSE WHERE ia_on_insta = TRUE;

-- =============================================
-- PART 5: REMOVE workflow_id FROM ia_config
-- =============================================
ALTER TABLE ia_config DROP COLUMN IF EXISTS workflow_id;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_instances_workflow_id ON instances(workflow_id);
CREATE INDEX IF NOT EXISTS idx_instagram_instances_workflow_id ON instagram_instances(workflow_id);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON COLUMN instances.workflow_id IS 'Workflow ID returned by IA service when this instance is activated';
COMMENT ON COLUMN instagram_instances.workflow_id IS 'Workflow ID returned by IA service when this instance is activated';
