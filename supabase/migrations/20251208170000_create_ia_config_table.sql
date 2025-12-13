-- Tabela de configurações da IA
CREATE TABLE IF NOT EXISTS public.ia_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Sobre a Empresa
    name TEXT,
    address TEXT,
    link_google TEXT,
    site TEXT,
    instagram TEXT,
    facebook TEXT,
    description TEXT,
    welcome TEXT,
    opening_hours TEXT,
    payment TEXT,
    
    -- Restrições (texto concatenado com bullets)
    restrictions TEXT,
    
    -- Qualificação (texto concatenado - produto: fluxo)
    qualify TEXT,
    
    -- FAQ (texto concatenado - produto: faq)
    frequent_questions TEXT,
    
    -- Configurações
    ia_on BOOLEAN DEFAULT FALSE,
    delay INTEGER DEFAULT 15,
    followup BOOLEAN DEFAULT FALSE,
    fup1 BOOLEAN DEFAULT FALSE,
    fup2 BOOLEAN DEFAULT FALSE,
    fup3 BOOLEAN DEFAULT FALSE,
    fup1_time INTEGER DEFAULT 60,
    fup2_time INTEGER DEFAULT 120,
    fup3_time INTEGER DEFAULT 180,
    fup1_message TEXT,
    fup2_message TEXT,
    fup3_message TEXT,
    crm_auto BOOLEAN DEFAULT FALSE,
    scheduling_on BOOLEAN DEFAULT FALSE,
    followup_business_hours BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ia_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own ia_config"
    ON public.ia_config
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index para busca por user_id
CREATE INDEX IF NOT EXISTS idx_ia_config_user_id ON public.ia_config(user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_ia_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ia_config_updated_at ON public.ia_config;
CREATE TRIGGER trigger_update_ia_config_updated_at
    BEFORE UPDATE ON public.ia_config
    FOR EACH ROW
    EXECUTE FUNCTION update_ia_config_updated_at();
