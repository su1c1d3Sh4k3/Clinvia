-- =============================================
-- Migração: Criação de Fluxos de CRM Padrão
-- Data: 2026-02-20
-- =============================================

-- 1. Adicionar `is_system` na tabela `crm_funnels` se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_funnels' AND column_name = 'is_system') THEN
        ALTER TABLE public.crm_funnels ADD COLUMN is_system BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Função para popular os funis padrão para um user_id
CREATE OR REPLACE FUNCTION public.create_default_crm_funnels(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_funnel_id UUID;
BEGIN
    -- =============================================
    -- 1. Atendimento IA
    -- =============================================
    -- Tenta encontrar o funil antigo chamado "IA" ou o novo "Atendimento IA"
    SELECT id INTO v_funnel_id FROM public.crm_funnels WHERE user_id = p_user_id AND (name = 'Atendimento IA' OR name = 'IA') ORDER BY created_at ASC LIMIT 1;
    
    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Atendimento IA', 'Funil dedicado ao atendimento da IA', true)
        RETURNING id INTO v_funnel_id;
        
        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Cliente Novo (IA)', 0, '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Qualificado (IA)', 1, '#22c55e', true),
        (v_funnel_id, p_user_id, 'Agendado (IA)', 2, '#a855f7', true),
        (v_funnel_id, p_user_id, 'Atendimento Humano (IA)', 3, '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up (IA)', 4, '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato (IA)', 997, '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse (IA)', 998, '#ef4444', true);
    ELSE
        -- Transforma em funil de sistema com o nome correto
        UPDATE public.crm_funnels SET is_system = true, name = 'Atendimento IA' WHERE id = v_funnel_id;
        -- Assegura que as etapas desse sistema não sejam deletadas (para compatibilidade com os 'IA' antigos)
        UPDATE public.crm_stages SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- =============================================
    -- 2. Qualificação Humana
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels WHERE user_id = p_user_id AND name = 'Qualificação Humana' LIMIT 1;
    
    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Qualificação Humana', 'Funil para contatos que requerem atenção humana', true)
        RETURNING id INTO v_funnel_id;
        
        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Cliente Novo', 0, '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Qualificado', 1, '#22c55e', true),
        (v_funnel_id, p_user_id, 'Agendado', 2, '#a855f7', true),
        (v_funnel_id, p_user_id, 'Atendimento', 3, '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up', 4, '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato', 997, '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse', 998, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- =============================================
    -- 3. Fluxo de Delivery
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels WHERE user_id = p_user_id AND name = 'Fluxo de Delivery' LIMIT 1;
    
    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Fluxo de Delivery', 'Funil de execução e entrega de procedimentos/produtos', true)
        RETURNING id INTO v_funnel_id;
        
        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Procedimento Agendado', 0, '#a855f7', true),
        (v_funnel_id, p_user_id, 'Procedimento Confirmado', 1, '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Procedimento Executado', 2, '#22c55e', true),
        (v_funnel_id, p_user_id, 'Pós Procedimento', 3, '#eab308', true),
        (v_funnel_id, p_user_id, 'Ganho', 998, '#10b981', true),
        (v_funnel_id, p_user_id, 'Perdido', 999, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- =============================================
    -- 4. Recorrência
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels WHERE user_id = p_user_id AND name = 'Recorrência' LIMIT 1;
    
    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Recorrência', 'Funil para contatos recorrentes e renovações', true)
        RETURNING id INTO v_funnel_id;
        
        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Qualificado', 0, '#22c55e', true),
        (v_funnel_id, p_user_id, 'Contato Realizado', 1, '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Agendado', 2, '#a855f7', true),
        (v_funnel_id, p_user_id, 'Ganho', 998, '#10b981', true),
        (v_funnel_id, p_user_id, 'Perdido', 999, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

END;
$$;

-- 3. Criar a trigger para ser ativada na criação de um novo profile
CREATE OR REPLACE FUNCTION public.trigger_create_default_crm_funnels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.create_default_crm_funnels(NEW.id);
    RETURN NEW;
END;
$$;

-- Remove the trigger if it exists and create it anew
DROP TRIGGER IF EXISTS after_profile_insert_crm_funnels ON public.profiles;
CREATE TRIGGER after_profile_insert_crm_funnels
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_create_default_crm_funnels();

-- 4. Rodar o populador para todos os clientes antigos de forma anônima
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP
        PERFORM public.create_default_crm_funnels(r.id);
    END LOOP;
END;
$$;
