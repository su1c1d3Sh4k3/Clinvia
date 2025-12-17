-- =============================================
-- FIX: Corrigir vazamento de notificações de agendamento entre tenants
-- Data: 2025-12-16
-- Problema: Trigger de agendamentos não inclui user_id e RLS permite todos verem
-- =============================================

-- 1. Atualizar trigger de agendamentos para incluir user_id
CREATE OR REPLACE FUNCTION notify_appointment_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_name TEXT;
    v_professional_name TEXT;
    v_old_status TEXT;
    v_new_status TEXT;
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT push_name INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;
        SELECT name INTO v_professional_name FROM professionals WHERE id = NEW.professional_id;
        
        v_contact_name := COALESCE(v_contact_name, 'Cliente');
        v_professional_name := COALESCE(v_professional_name, 'Profissional');
        
        v_old_status := CASE OLD.status
            WHEN 'pending' THEN 'Pendente'
            WHEN 'confirmed' THEN 'Confirmado'
            WHEN 'rescheduled' THEN 'Reagendado'
            WHEN 'completed' THEN 'Concluído'
            WHEN 'canceled' THEN 'Cancelado'
            ELSE OLD.status
        END;
        
        v_new_status := CASE NEW.status
            WHEN 'pending' THEN 'Pendente'
            WHEN 'confirmed' THEN 'Confirmado'
            WHEN 'rescheduled' THEN 'Reagendado'
            WHEN 'completed' THEN 'Concluído'
            WHEN 'canceled' THEN 'Cancelado'
            ELSE NEW.status
        END;

        INSERT INTO notifications (type, title, description, metadata, related_user_id, user_id)
        VALUES (
            'appointment_updated',
            'Agendamento Atualizado',
            'Agendamento de ' || v_contact_name || ' com ' || v_professional_name || 
            ' alterado de ' || v_old_status || ' para ' || v_new_status || '.',
            jsonb_build_object('appointment_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
            NEW.user_id,
            NEW.user_id  -- IMPORTANTE: Incluir user_id para filtro por tenant
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Corrigir RLS policy para incluir filtro de tenant em agendamentos
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        -- Primeiro: deve ser do mesmo tenant (user_id = owner_id)
        (user_id = get_owner_id() OR user_id IS NULL)
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

-- 3. Atualizar notificações existentes de agendamento sem user_id
UPDATE notifications n
SET user_id = a.user_id
FROM appointments a
WHERE n.type IN ('appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated')
  AND n.user_id IS NULL
  AND n.metadata->>'appointment_id' IS NOT NULL
  AND (n.metadata->>'appointment_id')::UUID = a.id;

-- 4. Para notificações de agendamento sem metadata válido, usar related_user_id
UPDATE notifications
SET user_id = related_user_id
WHERE type IN ('appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated')
  AND user_id IS NULL
  AND related_user_id IS NOT NULL;

-- 5. Log de sucesso
DO $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_updated_count
    FROM notifications
    WHERE type IN ('appointment_created', 'appointments_today', 'appointment_reminder', 'appointment_updated')
      AND user_id IS NOT NULL;
    
    RAISE NOTICE 'Migration completed: Fixed appointment notifications. % notifications now have user_id', v_updated_count;
END $$;
