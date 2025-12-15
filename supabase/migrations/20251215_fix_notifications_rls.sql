-- =============================================
-- FIX: Adicionar user_id à tabela notifications e corrigir RLS
-- Data: 2025-12-15 10:32
-- =============================================

-- 1. ADICIONAR COLUNA user_id
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. CRIAR ÍNDICE PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 3. CRIAR FUNÇÃO PARA VERIFICAR SE USER TEM ACESSO FINANCEIRO
CREATE OR REPLACE FUNCTION has_financial_notification_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_financial_access BOOLEAN;
    v_owner_id UUID;
BEGIN
    -- Buscar role do usuário atual
    SELECT role INTO v_role
    FROM team_members
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1;
    
    -- Admin sempre tem acesso
    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Supervisor: verificar configuração de acesso financeiro
    IF v_role = 'supervisor' THEN
        -- Buscar o owner_id do supervisor
        SELECT tm.user_id INTO v_owner_id
        FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
        LIMIT 1;
        
        -- Buscar configuração de acesso financeiro do owner
        SELECT financial_access INTO v_financial_access
        FROM profiles
        WHERE id = v_owner_id;
        
        RETURN COALESCE(v_financial_access, TRUE);
    END IF;
    
    -- Agent não tem acesso a notificações financeiras
    RETURN FALSE;
END;
$$;

-- 4. CRIAR FUNÇÃO PARA OBTER ROLE DO USUÁRIO ATUAL
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role
    FROM team_members
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1;
    
    RETURN v_role;
END;
$$;

-- 5. DROPAR POLICIES ANTIGAS
DROP POLICY IF EXISTS "Admins and Supervisors view all" ON public.notifications;
DROP POLICY IF EXISTS "Agents view their own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;

-- 6. CRIAR NOVA POLICY DE SELECT BASEADA NAS REGRAS
CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        -- Primeiro: deve ser do mesmo tenant (user_id = owner_id)
        (user_id = get_owner_id() OR user_id IS NULL)
        AND
        (
            -- TAREFAS (1-3): responsável + admin + supervisor
            (type IN ('task_created', 'task_open', 'task_finished') 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- CRM (4-6): responsável + admin + supervisor
            (type IN ('deal_created', 'deal_stage_changed', 'deal_stagnated') 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- FILAS (7): responsável + admin + supervisor
            (type = 'queue_changed' 
                AND (get_current_user_role() IN ('admin', 'supervisor') 
                    OR related_user_id = auth.uid()))
            OR
            -- AGENDAMENTOS (8-11): todos
            (type IN ('appointment_created', 'appointments_today', 
                     'appointment_reminder', 'appointment_updated'))
            OR
            -- FINANCEIRO (12-19): admin + supervisor com acesso
            (type IN ('revenue_created', 'revenue_due', 'revenue_overdue',
                     'expense_created', 'expense_due', 'expense_overdue',
                     'team_cost_created', 'marketing_campaign_created')
                AND has_financial_notification_access())
        )
    );

-- 7. POLICY DE INSERT (apenas system/triggers)
CREATE POLICY "notifications_insert" ON public.notifications
    FOR INSERT TO authenticated
    WITH CHECK (true); -- Triggers com SECURITY DEFINER fazem insert

-- 8. POLICY DE DELETE (para dismissals)
CREATE POLICY "notifications_delete" ON public.notifications
    FOR DELETE TO authenticated
    USING (user_id = get_owner_id() OR user_id IS NULL);

-- 9. ATUALIZAR TRIGGERS PARA INCLUIR user_id
-- Atualizar trigger de receitas
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

    INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
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
        NULL,
        NEW.user_id -- Usar o user_id da receita
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de despesas
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

    INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
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
        NULL,
        NEW.user_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de custos com equipe
CREATE OR REPLACE FUNCTION notify_team_cost_created()
RETURNS TRIGGER AS $$
DECLARE
    v_collaborator_name TEXT;
    v_total NUMERIC;
    v_status_label TEXT;
BEGIN
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

    INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
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
        NULL,
        NEW.user_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de campanhas de marketing
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

    INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
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
        NULL,
        NEW.user_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de tarefas
CREATE OR REPLACE FUNCTION notify_task_change()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := NEW.user_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'task_created',
            'Nova Tarefa: ' || NEW.title,
            'A tarefa "' || NEW.title || '" foi criada.',
            jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
            v_user_id,
            NEW.user_id
        );
    ELSIF NEW.status = 'open' AND (OLD.status IS DISTINCT FROM 'open') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'task_open',
            'Tarefa Aberta: ' || NEW.title,
            'A tarefa "' || NEW.title || '" foi iniciada.',
            jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
            v_user_id,
            NEW.user_id
        );
    ELSIF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'task_finished',
            'Tarefa Concluída: ' || NEW.title,
            'A tarefa "' || NEW.title || '" foi finalizada.',
            jsonb_build_object('task_id', NEW.id, 'urgency', NEW.urgency),
            v_user_id,
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de CRM deals
CREATE OR REPLACE FUNCTION notify_deal_change()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_name TEXT;
    v_stage_name TEXT;
BEGIN
    SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
    v_contact_name := COALESCE(v_contact_name, 'Cliente');

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'deal_created',
            'Nova Negociação',
            'Nova negociação criada para ' || v_contact_name,
            jsonb_build_object('deal_id', NEW.id, 'value', NEW.value),
            NEW.responsible_id,
            NEW.user_id
        );
    ELSIF (TG_OP = 'UPDATE') AND (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        SELECT name INTO v_stage_name FROM crm_stages WHERE id = NEW.stage_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'deal_stage_changed',
            'Mudança de Fase',
            'Negociação de ' || v_contact_name || ' moveu para ' || COALESCE(v_stage_name, 'nova fase'),
            jsonb_build_object('deal_id', NEW.id, 'stage_id', NEW.stage_id),
            NEW.responsible_id,
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar trigger de filas
CREATE OR REPLACE FUNCTION notify_queue_change()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_name TEXT;
    v_contact_name TEXT;
BEGIN
    IF (OLD.queue_id IS DISTINCT FROM NEW.queue_id) AND NEW.queue_id IS NOT NULL THEN
        SELECT name INTO v_queue_name FROM queues WHERE id = NEW.queue_id;
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
        
        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'queue_changed',
            'Mudança de Fila',
            'Cliente ' || COALESCE(v_contact_name, 'Desconhecido') || ' movido para fila ' || COALESCE(v_queue_name, 'Desconhecida'),
            jsonb_build_object('conversation_id', NEW.id, 'queue_id', NEW.queue_id),
            NEW.assigned_agent_id,
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. ATUALIZAR TRIGGER DE TAREFAS PARA INCLUIR INSERT
DROP TRIGGER IF EXISTS on_task_status_change ON tasks;
DROP TRIGGER IF EXISTS on_task_created_or_changed ON tasks;
CREATE TRIGGER on_task_created_or_changed
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_change();

-- 11. LOG DE SUCESSO
DO $$
BEGIN
    RAISE NOTICE 'Notifications table updated with user_id and RLS policies';
END $$;
