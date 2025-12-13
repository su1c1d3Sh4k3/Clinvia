-- Create CRM Funnels table
CREATE TABLE IF NOT EXISTS public.crm_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create CRM Stages table
CREATE TABLE IF NOT EXISTS public.crm_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#000000',
    position INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN DEFAULT false, -- To identify 'Ganho' and 'Perdido'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create CRM Deals table
CREATE TABLE IF NOT EXISTS public.crm_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    funnel_id UUID NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.crm_stages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    value NUMERIC(15, 2) DEFAULT 0,
    product TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

-- Policies for Funnels
CREATE POLICY "Users can view their own funnels" ON public.crm_funnels
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own funnels" ON public.crm_funnels
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own funnels" ON public.crm_funnels
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own funnels" ON public.crm_funnels
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for Stages (Access via Funnel ownership)
CREATE POLICY "Users can view stages of their funnels" ON public.crm_stages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.crm_funnels WHERE id = funnel_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can insert stages to their funnels" ON public.crm_stages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.crm_funnels WHERE id = funnel_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can update stages of their funnels" ON public.crm_stages
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.crm_funnels WHERE id = funnel_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can delete stages of their funnels" ON public.crm_stages
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.crm_funnels WHERE id = funnel_id AND user_id = auth.uid())
    );

-- Policies for Deals (Access via User ownership)
CREATE POLICY "Users can view their own deals" ON public.crm_deals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deals" ON public.crm_deals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deals" ON public.crm_deals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deals" ON public.crm_deals
    FOR DELETE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_crm_funnels_user_id ON public.crm_funnels(user_id);
CREATE INDEX idx_crm_stages_funnel_id ON public.crm_stages(funnel_id);
CREATE INDEX idx_crm_deals_user_id ON public.crm_deals(user_id);
CREATE INDEX idx_crm_deals_funnel_id ON public.crm_deals(funnel_id);
CREATE INDEX idx_crm_deals_stage_id ON public.crm_deals(stage_id);
CREATE INDEX idx_crm_deals_contact_id ON public.crm_deals(contact_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crm_funnels_updated_at BEFORE UPDATE ON public.crm_funnels FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_crm_stages_updated_at BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_crm_deals_updated_at BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
