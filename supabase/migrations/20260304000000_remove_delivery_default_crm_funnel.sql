-- =============================================
-- Migração: Remove "Fluxo de Delivery" dos funnels padrão do CRM
-- Data: 2026-03-04
-- Motivo: O módulo /delivery substitui este funil de CRM.
--         O "Fluxo de Delivery" não deve mais ser criado automaticamente.
-- =============================================

-- 1. Apagar deals cujas stages pertencem a funnels "Fluxo de Delivery"
DELETE FROM public.crm_deals
WHERE stage_id IN (
    SELECT cs.id
    FROM public.crm_stages cs
    JOIN public.crm_funnels cf ON cf.id = cs.funnel_id
    WHERE cf.name = 'Fluxo de Delivery'
      AND cf.is_system = true
);

-- 2. Apagar stages dos funnels "Fluxo de Delivery"
DELETE FROM public.crm_stages
WHERE funnel_id IN (
    SELECT id FROM public.crm_funnels
    WHERE name = 'Fluxo de Delivery'
      AND is_system = true
);

-- 3. Apagar os funnels "Fluxo de Delivery" de todas as contas
--    (instances.auto_create_deal_funnel_id tem ON DELETE SET NULL → tratado automaticamente)
DELETE FROM public.crm_funnels
WHERE name = 'Fluxo de Delivery'
  AND is_system = true;

-- 4. Recriar a função create_default_crm_funnels SEM o bloco "Fluxo de Delivery"
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
        UPDATE public.crm_funnels SET is_system = true, name = 'Atendimento IA' WHERE id = v_funnel_id;
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
    -- 3. Recorrência
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
