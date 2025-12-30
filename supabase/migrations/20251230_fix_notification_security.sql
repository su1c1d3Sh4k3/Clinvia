-- =============================================
-- SECURITY FIX: Correção de Vazamento de Notificações Entre Tenants
-- Data: 2025-12-30
-- =============================================
-- PROBLEMA: Notificações de financeiro e agendamentos sendo visualizadas
--           por clientes de outros tenants devido a:
--           1. RLS permitindo user_id IS NULL
--           2. Funções não preenchendo user_id nos INSERTs
-- =============================================

-- 1. DELETAR NOTIFICAÇÕES ÓRFÃS (sem user_id)
DELETE FROM notifications WHERE user_id IS NULL;

-- 2. CORRIGIR RLS POLICY - Remover "OR user_id IS NULL"
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        -- OBRIGATÓRIO: deve ser do mesmo tenant (user_id = owner_id)
        user_id = get_owner_id()
        AND
        (
            -- TAREFAS: responsável + admin + supervisor
            (type IN ('task_created', 'task_open', 'task_finished') 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- CRM: responsável + admin + supervisor
            (type IN ('deal_created', 'deal_stage_changed', 'deal_stagnated') 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- FILAS: responsável + admin + supervisor
            (type = 'queue_changed' 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- AGENDAMENTOS: admin/supervisor do mesmo tenant + responsável
            (type IN ('appointment_created', 'appointments_today', 
                     'appointment_reminder', 'appointment_updated')
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- FINANCEIRO: admin + supervisor com acesso
            (type IN ('revenue_created', 'revenue_due', 'revenue_overdue',
                     'expense_created', 'expense_due', 'expense_overdue',
                     'team_cost_created', 'marketing_campaign_created')
                AND has_financial_notification_access())
        )
    );

-- 3. CORRIGIR POLICY DE DELETE
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
    FOR DELETE TO authenticated
    USING (user_id = get_owner_id());

-- 4. ATUALIZAR check_financial_due_today() para incluir user_id
CREATE OR REPLACE FUNCTION check_financial_due_today()
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    -- Receitas com vencimento hoje e pendentes
    FOR r IN 
        SELECT id, item, amount, due_date, user_id
        FROM revenues
        WHERE due_date = CURRENT_DATE
        AND status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.type = 'revenue_due' 
            AND (n.metadata->>'revenue_id')::UUID = revenues.id
            AND DATE(n.created_at) = CURRENT_DATE
        )
    LOOP
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'revenue_due',
            'Receita com Vencimento Hoje',
            'Hoje temos a projeção de entrada do valor ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '".',
            jsonb_build_object('revenue_id', r.id, 'amount', r.amount, 'item', r.item),
            NULL,
            r.user_id  -- CORRIGIDO: Incluir user_id para isolamento de tenant
        );
    END LOOP;

    -- Despesas com vencimento hoje e pendentes
    FOR r IN 
        SELECT id, item, amount, due_date, user_id
        FROM expenses
        WHERE due_date = CURRENT_DATE
        AND status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.type = 'expense_due' 
            AND (n.metadata->>'expense_id')::UUID = expenses.id
            AND DATE(n.created_at) = CURRENT_DATE
        )
    LOOP
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'expense_due',
            'Despesa com Vencimento Hoje',
            'Hoje temos a cobrança do valor ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '".',
            jsonb_build_object('expense_id', r.id, 'amount', r.amount, 'item', r.item),
            NULL,
            r.user_id  -- CORRIGIDO: Incluir user_id para isolamento de tenant
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. ATUALIZAR check_financial_overdue() para incluir user_id
CREATE OR REPLACE FUNCTION check_financial_overdue()
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    -- Receitas em atraso (vencimento já passou, ainda pendente)
    FOR r IN 
        SELECT id, item, amount, due_date, user_id
        FROM revenues
        WHERE due_date < CURRENT_DATE
        AND status IN ('pending', 'overdue')
        AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.type = 'revenue_overdue' 
            AND (n.metadata->>'revenue_id')::UUID = revenues.id
            AND DATE(n.created_at) = CURRENT_DATE
        )
    LOOP
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'revenue_overdue',
            'Receita em Atraso',
            'A receita projetada para o dia ' || TO_CHAR(r.due_date, 'DD/MM/YYYY') || 
            ' no valor de ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '", não foi realizada, entre em contato para regularização.',
            jsonb_build_object(
                'revenue_id', r.id, 
                'amount', r.amount, 
                'item', r.item,
                'due_date', r.due_date,
                'days_overdue', CURRENT_DATE - r.due_date
            ),
            NULL,
            r.user_id  -- CORRIGIDO: Incluir user_id para isolamento de tenant
        );
        
        -- Atualizar status para overdue se ainda não estiver
        UPDATE revenues SET status = 'overdue' WHERE id = r.id AND status = 'pending';
    END LOOP;

    -- Despesas em atraso
    FOR r IN 
        SELECT id, item, amount, due_date, user_id
        FROM expenses
        WHERE due_date < CURRENT_DATE
        AND status IN ('pending', 'overdue')
        AND NOT EXISTS (
            SELECT 1 FROM notifications n 
            WHERE n.type = 'expense_overdue' 
            AND (n.metadata->>'expense_id')::UUID = expenses.id
            AND DATE(n.created_at) = CURRENT_DATE
        )
    LOOP
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'expense_overdue',
            'Despesa em Atraso',
            'A despesa que deveria ter sido paga no dia ' || TO_CHAR(r.due_date, 'DD/MM/YYYY') || 
            ' no valor de ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '", não foi realizada, favor regularizar a situação.',
            jsonb_build_object(
                'expense_id', r.id, 
                'amount', r.amount, 
                'item', r.item,
                'due_date', r.due_date,
                'days_overdue', CURRENT_DATE - r.due_date
            ),
            NULL,
            r.user_id  -- CORRIGIDO: Incluir user_id para isolamento de tenant
        );
        
        -- Atualizar status para overdue se ainda não estiver
        UPDATE expenses SET status = 'overdue' WHERE id = r.id AND status = 'pending';
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. ATUALIZAR check_crm_stagnation() para incluir user_id
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
            d.user_id,  -- Adicionar user_id do deal
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
        
        -- Buscar user_id (auth.users.id) a partir do team_member responsável
        v_user_id := NULL;
        IF r.responsible_id IS NOT NULL THEN
            SELECT user_id INTO v_user_id 
            FROM public.team_members 
            WHERE id = r.responsible_id;
        END IF;
        
        -- Se não encontrou via responsible, usar user_id do deal
        IF v_user_id IS NULL THEN
            v_user_id := r.user_id;
        END IF;
        
        INSERT INTO public.notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'deal_stagnated',
            'Negociação Estagnada',
            'Negociação com ' || COALESCE(v_contact_name, r.name) || ' está parada na fase ' || r.stage_name || ' há mais de ' || r.stagnation_limit_days || ' dias.',
            jsonb_build_object('deal_id', r.id, 'days_stagnated', EXTRACT(DAY FROM NOW() - r.stage_changed_at)),
            v_user_id,
            r.user_id  -- CORRIGIDO: Usar user_id do deal para isolamento de tenant
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. LOG DE SUCESSO
DO $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Contar quantas notificações foram deletadas (aproximado, já foram deletadas)
    RAISE NOTICE 'SECURITY FIX: Notification tenant isolation completed';
    RAISE NOTICE '- RLS policy updated to require user_id';
    RAISE NOTICE '- check_financial_due_today() updated';
    RAISE NOTICE '- check_financial_overdue() updated';
    RAISE NOTICE '- check_crm_stagnation() updated';
END $$;
