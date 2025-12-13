-- Add user_id to crm_funnels
ALTER TABLE public.crm_funnels
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to crm_stages
ALTER TABLE public.crm_stages
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to crm_deals
ALTER TABLE public.crm_deals
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id (using the specific ID from previous backfills for consistency)
UPDATE public.crm_funnels
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

UPDATE public.crm_stages
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

UPDATE public.crm_deals
SET user_id = '3e21175c-b183-4041-b375-eacb292e8d41'
WHERE user_id IS NULL;

-- Enable RLS
ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

-- Policies for crm_funnels
DROP POLICY IF EXISTS "Users can view their own funnels" ON public.crm_funnels;
CREATE POLICY "Users can view their own funnels" ON public.crm_funnels
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own funnels" ON public.crm_funnels;
CREATE POLICY "Users can manage their own funnels" ON public.crm_funnels
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies for crm_stages
DROP POLICY IF EXISTS "Users can view their own stages" ON public.crm_stages;
CREATE POLICY "Users can view their own stages" ON public.crm_stages
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own stages" ON public.crm_stages;
CREATE POLICY "Users can manage their own stages" ON public.crm_stages
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies for crm_deals
DROP POLICY IF EXISTS "Users can view their own deals" ON public.crm_deals;
CREATE POLICY "Users can view their own deals" ON public.crm_deals
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own deals" ON public.crm_deals;
CREATE POLICY "Users can manage their own deals" ON public.crm_deals
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
