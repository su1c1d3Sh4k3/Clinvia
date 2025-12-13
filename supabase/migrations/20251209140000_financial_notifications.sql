-- =============================================
-- NOTIFICAÇÕES FINANCEIRAS
-- =============================================

-- 1. Atualizar constraint de tipos de notificação
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
        -- Tipos existentes
        'task_created', 'task_open', 'task_finished', 
        'deal_stagnated', 'deal_created', 'deal_stage_changed', 
        'queue_changed', 
        'appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated',
        -- Novos tipos financeiros
        'revenue_due', 'expense_due',
        'revenue_overdue', 'expense_overdue',
        'revenue_created', 'expense_created',
        'team_cost_created', 'marketing_campaign_created'
    )
);

-- =============================================
-- 2. TRIGGER: Notificar novos lançamentos
-- =============================================

-- Helper function para formatar valor em reais
CREATE OR REPLACE FUNCTION format_currency_brl(amount NUMERIC)
RETURNS TEXT AS $$
BEGIN
    RETURN 'R$ ' || TO_CHAR(amount, 'FM999G999G999D00');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para Receitas
CREATE OR REPLACE FUNCTION notify_revenue_created()
RETURNS TRIGGER AS $$
DECLARE
    v_status_label TEXT;
BEGIN
    v_status_label := CASE NEW.status
        WHEN 'paid' THEN 'Pago'
        WHEN 'pending' THEN 'Pendente'
        WHEN 'overdue' THEN 'Atrasado'
        WHEN 'cancelled' THEN 'Cancelado'
        ELSE NEW.status
    END;

    INSERT INTO notifications (type, title, description, metadata, related_user_id)
    VALUES (
        'revenue_created',
        'Nova Receita Lançada',
        'Nova receita lançada no valor de ' || format_currency_brl(NEW.amount) || 
        ', para o item "' || NEW.item || '" com vencimento ' || 
        TO_CHAR(NEW.due_date, 'DD/MM/YYYY') || ' e está com status ' || v_status_label || '.',
        jsonb_build_object(
            'revenue_id', NEW.id,
            'amount', NEW.amount,
            'item', NEW.item,
            'due_date', NEW.due_date,
            'status', NEW.status
        ),
        NULL -- NULL para que todos admins/supervisors vejam
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_revenue_created ON revenues;
CREATE TRIGGER on_revenue_created
    AFTER INSERT ON revenues
    FOR EACH ROW
    EXECUTE FUNCTION notify_revenue_created();

-- Trigger para Despesas
CREATE OR REPLACE FUNCTION notify_expense_created()
RETURNS TRIGGER AS $$
DECLARE
    v_status_label TEXT;
BEGIN
    v_status_label := CASE NEW.status
        WHEN 'paid' THEN 'Pago'
        WHEN 'pending' THEN 'Pendente'
        WHEN 'overdue' THEN 'Atrasado'
        WHEN 'cancelled' THEN 'Cancelado'
        ELSE NEW.status
    END;

    INSERT INTO notifications (type, title, description, metadata, related_user_id)
    VALUES (
        'expense_created',
        'Nova Despesa Lançada',
        'Nova despesa lançada no valor de ' || format_currency_brl(NEW.amount) || 
        ', para o item "' || NEW.item || '" com vencimento ' || 
        TO_CHAR(NEW.due_date, 'DD/MM/YYYY') || ' e está com status ' || v_status_label || '.',
        jsonb_build_object(
            'expense_id', NEW.id,
            'amount', NEW.amount,
            'item', NEW.item,
            'due_date', NEW.due_date,
            'status', NEW.status
        ),
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_expense_created ON expenses;
CREATE TRIGGER on_expense_created
    AFTER INSERT ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION notify_expense_created();

-- Trigger para Custos com Equipe
CREATE OR REPLACE FUNCTION notify_team_cost_created()
RETURNS TRIGGER AS $$
DECLARE
    v_collaborator_name TEXT;
    v_total NUMERIC;
    v_status_label TEXT;
BEGIN
    -- Buscar nome do colaborador
    IF NEW.team_member_id IS NOT NULL THEN
        SELECT name INTO v_collaborator_name FROM team_members WHERE id = NEW.team_member_id;
    ELSIF NEW.professional_id IS NOT NULL THEN
        SELECT name INTO v_collaborator_name FROM professionals WHERE id = NEW.professional_id;
    END IF;
    v_collaborator_name := COALESCE(v_collaborator_name, 'Colaborador');
    
    v_total := NEW.base_salary + NEW.commission + NEW.bonus - NEW.deductions;
    
    v_status_label := CASE NEW.status
        WHEN 'paid' THEN 'Pago'
        WHEN 'pending' THEN 'Pendente'
        WHEN 'overdue' THEN 'Atrasado'
        WHEN 'cancelled' THEN 'Cancelado'
        ELSE NEW.status
    END;

    INSERT INTO notifications (type, title, description, metadata, related_user_id)
    VALUES (
        'team_cost_created',
        'Novo Custo com Equipe',
        'Novo custo com equipe lançado no valor de ' || format_currency_brl(v_total) || 
        ', para o colaborador "' || v_collaborator_name || '" com vencimento ' || 
        TO_CHAR(NEW.due_date, 'DD/MM/YYYY') || ' e está com status ' || v_status_label || '.',
        jsonb_build_object(
            'team_cost_id', NEW.id,
            'amount', v_total,
            'collaborator', v_collaborator_name,
            'due_date', NEW.due_date,
            'status', NEW.status
        ),
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_team_cost_created ON team_costs;
CREATE TRIGGER on_team_cost_created
    AFTER INSERT ON team_costs
    FOR EACH ROW
    EXECUTE FUNCTION notify_team_cost_created();

-- Trigger para Campanhas de Marketing
CREATE OR REPLACE FUNCTION notify_marketing_campaign_created()
RETURNS TRIGGER AS $$
DECLARE
    v_status_label TEXT;
BEGIN
    v_status_label := CASE NEW.status
        WHEN 'active' THEN 'Ativa'
        WHEN 'paused' THEN 'Pausada'
        WHEN 'finished' THEN 'Finalizada'
        ELSE NEW.status
    END;

    INSERT INTO notifications (type, title, description, metadata, related_user_id)
    VALUES (
        'marketing_campaign_created',
        'Nova Campanha de Marketing',
        'Nova campanha de marketing lançada no valor de ' || format_currency_brl(NEW.investment) || 
        ', para a campanha "' || NEW.name || '" com início em ' || 
        TO_CHAR(NEW.start_date, 'DD/MM/YYYY') || ' e está com status ' || v_status_label || '.',
        jsonb_build_object(
            'campaign_id', NEW.id,
            'investment', NEW.investment,
            'name', NEW.name,
            'start_date', NEW.start_date,
            'status', NEW.status
        ),
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_marketing_campaign_created ON marketing_campaigns;
CREATE TRIGGER on_marketing_campaign_created
    AFTER INSERT ON marketing_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION notify_marketing_campaign_created();

-- =============================================
-- 3. RPC: Verificar vencimentos do dia
-- =============================================

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
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'revenue_due',
            'Receita com Vencimento Hoje',
            'Hoje temos a projeção de entrada do valor ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '".',
            jsonb_build_object('revenue_id', r.id, 'amount', r.amount, 'item', r.item),
            NULL
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
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
        VALUES (
            'expense_due',
            'Despesa com Vencimento Hoje',
            'Hoje temos a cobrança do valor ' || format_currency_brl(r.amount) || 
            ' referente a "' || r.item || '".',
            jsonb_build_object('expense_id', r.id, 'amount', r.amount, 'item', r.item),
            NULL
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 4. RPC: Verificar atrasos
-- =============================================

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
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
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
            NULL
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
        INSERT INTO notifications (type, title, description, metadata, related_user_id)
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
            NULL
        );
        
        -- Atualizar status para overdue se ainda não estiver
        UPDATE expenses SET status = 'overdue' WHERE id = r.id AND status = 'pending';
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
