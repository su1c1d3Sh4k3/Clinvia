-- =============================================
-- Migração: Reformulação do Funil Recorrência
-- Data: 2026-03-10
-- =============================================
-- Novas etapas:
--   Apto para avaliação (0), Avaliação agendada (1), Avaliação concluída (2),
--   Agendado (3), Follow Up (4), Sem Contato (997), Sem Interesse (998),
--   Ganho (999), Perdido (1000)
-- =============================================


-- =============================================
-- 1. Atualizar função create_default_crm_funnels
--    para que novos clientes já recebam as etapas corretas
-- =============================================
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
    SELECT id INTO v_funnel_id FROM public.crm_funnels
    WHERE user_id = p_user_id AND (name = 'Atendimento IA' OR name = 'IA')
    ORDER BY created_at ASC LIMIT 1;

    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Atendimento IA', 'Funil dedicado ao atendimento da IA', true)
        RETURNING id INTO v_funnel_id;

        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Cliente Novo (IA)',      0,   '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Qualificado (IA)',       1,   '#22c55e', true),
        (v_funnel_id, p_user_id, 'Agendado (IA)',          2,   '#a855f7', true),
        (v_funnel_id, p_user_id, 'Atendimento Humano (IA)', 3,  '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up (IA)',         4,   '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato (IA)',       997, '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse (IA)',     998, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true, name = 'Atendimento IA' WHERE id = v_funnel_id;
        UPDATE public.crm_stages  SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- =============================================
    -- 2. Qualificação Humana
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels
    WHERE user_id = p_user_id AND name = 'Qualificação Humana' LIMIT 1;

    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Qualificação Humana', 'Funil para contatos que requerem atenção humana', true)
        RETURNING id INTO v_funnel_id;

        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Cliente Novo',  0,   '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Qualificado',   1,   '#22c55e', true),
        (v_funnel_id, p_user_id, 'Agendado',      2,   '#a855f7', true),
        (v_funnel_id, p_user_id, 'Atendimento',   3,   '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up',     4,   '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato',   997, '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse', 998, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages  SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- NOTE: "Fluxo de Delivery" removido em 2026-03-04.
    --       O módulo /delivery substituiu este funil.
    --       Ver migração: 20260304000000_remove_delivery_default_crm_funnel.sql

    -- =============================================
    -- 3. Recorrência  ← ATUALIZADO em 2026-03-10
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels
    WHERE user_id = p_user_id AND name = 'Recorrência' LIMIT 1;

    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Recorrência', 'Funil para contatos recorrentes e renovações', true)
        RETURNING id INTO v_funnel_id;

        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Apto para avaliação', 0,    '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Avaliação agendada',  1,    '#22c55e', true),
        (v_funnel_id, p_user_id, 'Avaliação concluída', 2,    '#a855f7', true),
        (v_funnel_id, p_user_id, 'Agendado',            3,    '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up',           4,    '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato',         997,  '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse',       998,  '#ef4444', true),
        (v_funnel_id, p_user_id, 'Ganho',               999,  '#10b981', true),
        (v_funnel_id, p_user_id, 'Perdido',             1000, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages  SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

END;
$$;


-- =============================================
-- 2. Aplicar as novas etapas em todos os clientes já cadastrados
--    Estratégia segura: renomear etapas existentes (preserva UUIDs e deals),
--    inserir apenas as etapas que não existem, reposicionar Ganho/Perdido.
-- =============================================
DO $$
DECLARE
    r           RECORD;
    v_funnel_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP

        -- Buscar o funil Recorrência deste usuário
        SELECT id INTO v_funnel_id
        FROM public.crm_funnels
        WHERE user_id = r.id AND name = 'Recorrência'
        LIMIT 1;

        CONTINUE WHEN v_funnel_id IS NULL;

        -- ── Renomear etapas existentes (preserva UUIDs e deals associados) ──

        UPDATE public.crm_stages
        SET name = 'Apto para avaliação', color = '#3b82f6', position = 0
        WHERE funnel_id = v_funnel_id AND name = 'Qualificado';

        UPDATE public.crm_stages
        SET name = 'Avaliação agendada', color = '#22c55e', position = 1
        WHERE funnel_id = v_funnel_id AND name = 'Contato Realizado';

        -- "Agendado" vira "Avaliação concluída" para liberar o nome "Agendado" para a nova etapa
        UPDATE public.crm_stages
        SET name = 'Avaliação concluída', color = '#a855f7', position = 2
        WHERE funnel_id = v_funnel_id AND name = 'Agendado';

        -- ── Reposicionar Ganho e Perdido ──

        UPDATE public.crm_stages
        SET position = 999
        WHERE funnel_id = v_funnel_id AND name = 'Ganho';

        UPDATE public.crm_stages
        SET position = 1000
        WHERE funnel_id = v_funnel_id AND name = 'Perdido';

        -- ── Inserir etapas novas (apenas se ainda não existirem) ──

        IF NOT EXISTS (
            SELECT 1 FROM public.crm_stages
            WHERE funnel_id = v_funnel_id AND name = 'Agendado'
        ) THEN
            INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
            VALUES (v_funnel_id, r.id, 'Agendado', 3, '#f97316', true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.crm_stages
            WHERE funnel_id = v_funnel_id AND name = 'Follow Up'
        ) THEN
            INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
            VALUES (v_funnel_id, r.id, 'Follow Up', 4, '#eab308', true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.crm_stages
            WHERE funnel_id = v_funnel_id AND name = 'Sem Contato'
        ) THEN
            INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
            VALUES (v_funnel_id, r.id, 'Sem Contato', 997, '#6b7280', true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.crm_stages
            WHERE funnel_id = v_funnel_id AND name = 'Sem Interesse'
        ) THEN
            INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
            VALUES (v_funnel_id, r.id, 'Sem Interesse', 998, '#ef4444', true);
        END IF;

    END LOOP;
END;
$$;
