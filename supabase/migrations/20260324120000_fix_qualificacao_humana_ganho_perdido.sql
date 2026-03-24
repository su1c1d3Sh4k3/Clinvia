-- =============================================
-- Migração: Adiciona Ganho e Perdido ao funil "Qualificação Humana"
-- Data: 2026-03-24
-- Motivo: A função create_default_crm_funnels nunca incluiu Ganho/Perdido
--         no bloco "Qualificação Humana". Clientes novos chegavam sem essas etapas.
-- =============================================

-- =============================================
-- 1. Corrigir a função create_default_crm_funnels
--    para que novos clientes já recebam Ganho/Perdido em Qualificação Humana
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
    -- 1. Atendimento IA (SEM Ganho/Perdido — funil de suporte IA)
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
    -- 2. Qualificação Humana (COM Ganho/Perdido)
    -- =============================================
    SELECT id INTO v_funnel_id FROM public.crm_funnels
    WHERE user_id = p_user_id AND name = 'Qualificação Humana' LIMIT 1;

    IF v_funnel_id IS NULL THEN
        INSERT INTO public.crm_funnels (user_id, name, description, is_system)
        VALUES (p_user_id, 'Qualificação Humana', 'Funil para contatos que requerem atenção humana', true)
        RETURNING id INTO v_funnel_id;

        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system) VALUES
        (v_funnel_id, p_user_id, 'Cliente Novo',  0,    '#3b82f6', true),
        (v_funnel_id, p_user_id, 'Qualificado',   1,    '#22c55e', true),
        (v_funnel_id, p_user_id, 'Agendado',      2,    '#a855f7', true),
        (v_funnel_id, p_user_id, 'Atendimento',   3,    '#f97316', true),
        (v_funnel_id, p_user_id, 'Follow Up',     4,    '#eab308', true),
        (v_funnel_id, p_user_id, 'Sem Contato',   997,  '#6b7280', true),
        (v_funnel_id, p_user_id, 'Sem Interesse', 998,  '#ef4444', true),
        (v_funnel_id, p_user_id, 'Ganho',         999,  '#10b981', true),
        (v_funnel_id, p_user_id, 'Perdido',       1000, '#ef4444', true);
    ELSE
        UPDATE public.crm_funnels SET is_system = true WHERE id = v_funnel_id;
        UPDATE public.crm_stages  SET is_system = true WHERE funnel_id = v_funnel_id;
    END IF;

    -- =============================================
    -- 3. Recorrência (COM Ganho/Perdido)
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
-- 2. Corrigir clientes JÁ CADASTRADOS
--    Adiciona Ganho/Perdido em todos os funis "Qualificação Humana" que
--    ainda não possuem essas etapas.
-- =============================================
DO $$
DECLARE
    r           RECORD;
    v_funnel_id UUID;
BEGIN
    FOR r IN
        SELECT cf.id AS funnel_id, cf.user_id
        FROM public.crm_funnels cf
        WHERE cf.name = 'Qualificação Humana'
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_stages cs
              WHERE cs.funnel_id = cf.id AND cs.name = 'Ganho'
          )
    LOOP
        -- Inserir Ganho se ausente
        INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
        VALUES (r.funnel_id, r.user_id, 'Ganho', 999, '#10b981', true)
        ON CONFLICT DO NOTHING;

        -- Inserir Perdido se ausente
        IF NOT EXISTS (
            SELECT 1 FROM public.crm_stages
            WHERE funnel_id = r.funnel_id AND name = 'Perdido'
        ) THEN
            INSERT INTO public.crm_stages (funnel_id, user_id, name, position, color, is_system)
            VALUES (r.funnel_id, r.user_id, 'Perdido', 1000, '#ef4444', true);
        END IF;
    END LOOP;
END;
$$;
