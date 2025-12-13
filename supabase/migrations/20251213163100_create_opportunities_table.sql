-- =============================================
-- Create opportunities table
-- =============================================

CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Tipo de oportunidade
    type TEXT NOT NULL CHECK (type IN ('service', 'product')),
    
    -- Referências
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    product_service_id UUID REFERENCES public.products_services(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
    
    -- Referência original (para evitar duplicatas)
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    revenue_id UUID REFERENCES public.revenues(id) ON DELETE SET NULL,
    
    -- Datas
    reference_date DATE NOT NULL,  -- Data do serviço concluído ou pagamento
    alert_date DATE NOT NULL,      -- Data que deve aparecer o alerta (reference_date + opportunity_alert_days)
    
    -- Atribuição
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Se NULL, todos podem ver
    claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- Quem assumiu a oportunidade
    claimed_at TIMESTAMPTZ,
    
    -- Controle
    dismissed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_opportunities_user_id ON public.opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON public.opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_alert_date ON public.opportunities(alert_date);
CREATE INDEX IF NOT EXISTS idx_opportunities_claimed_by ON public.opportunities(claimed_by);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON public.opportunities(type);

-- Unique constraint to prevent duplicate opportunities for same appointment/revenue
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_appointment_unique 
    ON public.opportunities(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_revenue_unique 
    ON public.opportunities(revenue_id) WHERE revenue_id IS NOT NULL;

-- =============================================
-- RLS Policies
-- =============================================

-- Helper function check if user is in profiles (admin)
-- Already exists from team_system migration

-- Policy: Admins and Supervisors can see all opportunities
CREATE POLICY "Admins and Supervisors can view all opportunities"
    ON public.opportunities FOR SELECT
    TO authenticated
    USING (is_admin() OR is_supervisor());

-- Policy: Agents can see opportunities assigned to them OR unassigned
CREATE POLICY "Agents can view assigned or unassigned opportunities"
    ON public.opportunities FOR SELECT
    TO authenticated
    USING (
        is_agent() AND (
            assigned_to = auth.uid() 
            OR assigned_to IS NULL
            OR claimed_by = auth.uid()
        )
    );

-- Policy: Anyone can update (claim) opportunities they can see
CREATE POLICY "Users can claim opportunities"
    ON public.opportunities FOR UPDATE
    TO authenticated
    USING (
        -- Can update if they can see it
        is_admin() OR is_supervisor() OR
        (is_agent() AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    )
    WITH CHECK (
        is_admin() OR is_supervisor() OR
        (is_agent() AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    );

-- Policy: Only service role can insert (via edge function)
CREATE POLICY "Service role can insert opportunities"
    ON public.opportunities FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;
ALTER TABLE public.opportunities REPLICA IDENTITY FULL;

-- Comments
COMMENT ON TABLE public.opportunities IS 'Stores sales/service opportunities for follow-up based on opportunity_alert_days';
COMMENT ON COLUMN public.opportunities.type IS 'Type of opportunity: service (from appointments) or product (from revenues)';
COMMENT ON COLUMN public.opportunities.reference_date IS 'Date when the service was completed or product was paid';
COMMENT ON COLUMN public.opportunities.alert_date IS 'Date when the opportunity should appear (reference_date + opportunity_alert_days)';
COMMENT ON COLUMN public.opportunities.assigned_to IS 'If set, only this user (plus admins/supervisors) can see the opportunity';
COMMENT ON COLUMN public.opportunities.claimed_by IS 'User who claimed/took action on this opportunity';
