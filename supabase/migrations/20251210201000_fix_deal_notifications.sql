-- =============================================
-- Migration: Corrigir Funções de Notificação de Deals
-- =============================================
-- PROBLEMA: responsible_id agora é team_members.id, mas 
--           notifications.related_user_id exige auth.users.id
-- SOLUÇÃO:  Buscar user_id de team_members antes de inserir notificação
-- =============================================

-- 1. Recriar função notify_deal_change() com SECURITY DEFINER
-- Esta função é chamada pelo trigger on_deal_created_or_moved
CREATE OR REPLACE FUNCTION notify_deal_change()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_name TEXT;
    v_stage_name TEXT;
    v_user_id UUID;
BEGIN
    -- Obter nome do contato
    SELECT push_name INTO v_contact_name 
    FROM public.contacts 
    WHERE id = NEW.contact_id;
    v_contact_name := COALESCE(v_contact_name, 'Cliente');

    -- CORREÇÃO: Buscar user_id (auth.users.id) a partir do team_member
    -- responsible_id agora é team_members.id, não auth.users.id
    v_user_id := NULL;
    IF NEW.responsible_id IS NOT NULL THEN
        SELECT user_id INTO v_user_id 
        FROM public.team_members 
        WHERE id = NEW.responsible_id;
    END IF;

    -- Notificação de nova negociação criada
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_created',
            'Nova Negociação',
            'Nova negociação criada para ' || v_contact_name,
            jsonb_build_object('deal_id', NEW.id, 'value', NEW.value),
            v_user_id  -- Usar user_id (auth.users.id), não team_members.id
        );
    -- Notificação de mudança de estágio
    ELSIF (TG_OP = 'UPDATE') AND (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        SELECT name INTO v_stage_name 
        FROM public.crm_stages 
        WHERE id = NEW.stage_id;
        
        INSERT INTO public.notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_stage_changed',
            'Mudança de Fase',
            'Negociação de ' || v_contact_name || ' moveu para ' || COALESCE(v_stage_name, 'nova fase'),
            jsonb_build_object('deal_id', NEW.id, 'stage_id', NEW.stage_id),
            v_user_id  -- Usar user_id (auth.users.id), não team_members.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Recriar função check_crm_stagnation() com SECURITY DEFINER
-- Esta função é chamada manualmente para verificar deals estagnados
CREATE OR REPLACE FUNCTION check_crm_stagnation()
RETURNS void AS $$
DECLARE
    r RECORD;
    v_contact_name TEXT;
    v_user_id UUID;
BEGIN
    FOR r IN 
        SELECT 
            d.id, 
            d.name, 
            d.responsible_id, 
            d.stage_changed_at, 
            s.stagnation_limit_days, 
            s.name as stage_name, 
            d.contact_id
        FROM public.crm_deals d
        JOIN public.crm_stages s ON d.stage_id = s.id
        WHERE s.stagnation_limit_days > 0
        AND d.status = 'open'
        AND d.stage_changed_at < NOW() - (s.stagnation_limit_days || ' days')::INTERVAL
        -- Evitar notificações duplicadas nas últimas 24h
        AND NOT EXISTS (
            SELECT 1 FROM public.notifications n 
            WHERE n.type = 'deal_stagnated' 
            AND (n.metadata->>'deal_id')::UUID = d.id
            AND n.created_at > NOW() - INTERVAL '24 hours'
        )
    LOOP
        -- Obter nome do contato
        SELECT push_name INTO v_contact_name 
        FROM public.contacts 
        WHERE id = r.contact_id;
        
        -- CORREÇÃO: Buscar user_id (auth.users.id) a partir do team_member
        v_user_id := NULL;
        IF r.responsible_id IS NOT NULL THEN
            SELECT user_id INTO v_user_id 
            FROM public.team_members 
            WHERE id = r.responsible_id;
        END IF;
        
        INSERT INTO public.notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'deal_stagnated',
            'Negociação Estagnada',
            'Negociação com ' || COALESCE(v_contact_name, r.name) || ' está parada na fase ' || r.stage_name || ' há mais de ' || r.stagnation_limit_days || ' dias.',
            jsonb_build_object('deal_id', r.id, 'days_stagnated', EXTRACT(DAY FROM NOW() - r.stage_changed_at)),
            v_user_id  -- Usar user_id (auth.users.id), não team_members.id
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Documentação
COMMENT ON FUNCTION notify_deal_change() IS 'Trigger function que cria notificações quando deals são criados ou movidos de estágio. Busca user_id de team_members para related_user_id.';
COMMENT ON FUNCTION check_crm_stagnation() IS 'Função RPC que verifica deals estagnados e cria notificações. Busca user_id de team_members para related_user_id.';
