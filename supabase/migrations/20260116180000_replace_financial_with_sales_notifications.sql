-- =============================================
-- 1. REMOVER TRIGGERS DE NOTIFICAÇÃO FINANCEIRA
-- =============================================

-- Remover triggers
DROP TRIGGER IF EXISTS on_revenue_created ON revenues;
DROP TRIGGER IF EXISTS on_expense_created ON expenses;
DROP TRIGGER IF EXISTS on_team_cost_created ON team_costs;
DROP TRIGGER IF EXISTS on_marketing_campaign_created ON marketing_campaigns;

-- Remover funções de triggers financeiros
DROP FUNCTION IF EXISTS notify_revenue_created() CASCADE;
DROP FUNCTION IF EXISTS notify_expense_created() CASCADE;
DROP FUNCTION IF EXISTS notify_team_cost_created() CASCADE;
DROP FUNCTION IF EXISTS notify_marketing_campaign_created() CASCADE;

-- Remover funções de verificação de vencimento (cron jobs)
DROP FUNCTION IF EXISTS check_financial_due_today() CASCADE;
DROP FUNCTION IF EXISTS check_financial_overdue() CASCADE;

-- =============================================
-- 2. LIMPAR NOTIFICAÇÕES FINANCEIRAS EXISTENTES (ANTES DA CONSTRAINT)
-- =============================================

DELETE FROM notifications 
WHERE type IN (
    'revenue_due', 'expense_due',
    'revenue_overdue', 'expense_overdue',
    'revenue_created', 'expense_created',
    'team_cost_created', 'marketing_campaign_created'
);

-- =============================================
-- 3. ATUALIZAR CONSTRAINT DE TIPOS DE NOTIFICAÇÃO
-- =============================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
        -- Tarefas
        'task_created', 'task_open', 'task_finished', 
        
        -- CRM
        'deal_stagnated', 'deal_created', 'deal_stage_changed', 
        
        -- Conversas
        'queue_changed', 
        
        -- Agendamentos
        'appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated',
        
        -- Vendas (NOVOS)
        'sale_cash', 'sale_installment', 'sale_pending'
    )
);


-- =============================================
-- 3. FUNÇÃO PARA NOTIFICAR NOVAS VENDAS
-- =============================================

CREATE OR REPLACE FUNCTION notify_sale_created()
RETURNS TRIGGER AS $$
DECLARE
    v_product_name TEXT;
    v_contact_name TEXT;
    v_agent_name TEXT;
    v_total_formatted TEXT;
    v_notification_type TEXT;
    v_notification_title TEXT;
    v_notification_description TEXT;
BEGIN
    -- Buscar nome do produto/serviço
    SELECT name INTO v_product_name 
    FROM products_services 
    WHERE id = NEW.product_service_id;
    v_product_name := COALESCE(v_product_name, 'Produto/Serviço');
    
    -- Buscar nome do cliente (se vinculado)
    IF NEW.contact_id IS NOT NULL THEN
        SELECT push_name INTO v_contact_name 
        FROM contacts 
        WHERE id = NEW.contact_id;
    END IF;
    v_contact_name := COALESCE(v_contact_name, 'Cliente não identificado');
    
    -- Buscar nome do atendente (se vinculado)
    IF NEW.team_member_id IS NOT NULL THEN
        SELECT name INTO v_agent_name 
        FROM team_members 
        WHERE id = NEW.team_member_id;
    ELSIF NEW.professional_id IS NOT NULL THEN
        SELECT name INTO v_agent_name 
        FROM professionals 
        WHERE id = NEW.professional_id;
    END IF;
    v_agent_name := COALESCE(v_agent_name, 'Não atribuído');
    
    -- Formatar valor
    v_total_formatted := 'R$ ' || TO_CHAR(NEW.total_amount, 'FM999G999G999D00');
    
    -- Determinar tipo de notificação baseado no payment_type
    IF NEW.payment_type = 'cash' THEN
        v_notification_type := 'sale_cash';
        v_notification_title := '💵 Nova Venda à Vista';
        v_notification_description := 'Venda à vista de ' || v_total_formatted || 
            ' para "' || v_product_name || '"' ||
            ' realizada por ' || v_agent_name || 
            ' para o cliente ' || v_contact_name || '.';
    ELSIF NEW.payment_type = 'installment' THEN
        v_notification_type := 'sale_installment';
        v_notification_title := '📅 Nova Venda a Prazo';
        v_notification_description := 'Venda parcelada em ' || NEW.installments || 'x de ' || v_total_formatted || 
            ' para "' || v_product_name || '"' ||
            ' realizada por ' || v_agent_name || 
            ' para o cliente ' || v_contact_name || '.';
    ELSIF NEW.payment_type = 'pending' THEN
        v_notification_type := 'sale_pending';
        v_notification_title := '⏳ Nova Venda com Pagamento Pendente';
        v_notification_description := 'Nova venda de ' || v_total_formatted || 
            ' para "' || v_product_name || '"' ||
            ' aguardando pagamento do cliente ' || v_contact_name || 
            '. Responsável: ' || v_agent_name || '.';
    ELSE
        -- Fallback para outros tipos (não deveria acontecer)
        RETURN NEW;
    END IF;
    
    -- Inserir notificação (related_user_id = NULL para que admins/supervisors vejam)
    INSERT INTO notifications (type, title, description, metadata, related_user_id)
    VALUES (
        v_notification_type,
        v_notification_title,
        v_notification_description,
        jsonb_build_object(
            'sale_id', NEW.id,
            'total_amount', NEW.total_amount,
            'payment_type', NEW.payment_type,
            'installments', NEW.installments,
            'product_service_id', NEW.product_service_id,
            'product_service_name', v_product_name,
            'contact_id', NEW.contact_id,
            'contact_name', v_contact_name,
            'team_member_id', NEW.team_member_id,
            'professional_id', NEW.professional_id,
            'agent_name', v_agent_name,
            'sale_date', NEW.sale_date,
            'quantity', NEW.quantity
        ),
        NULL -- NULL para que admins e supervisors vejam
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 4. CRIAR TRIGGER PARA VENDAS
-- =============================================

DROP TRIGGER IF EXISTS on_sale_created ON sales;
CREATE TRIGGER on_sale_created
    AFTER INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION notify_sale_created();
