-- ============================================================================
-- Recurrence Tracking System
-- Tracks service recurrence cycles for clients based on completed appointments
-- ============================================================================

-- 1. Create recurrence_tracking table
CREATE TABLE IF NOT EXISTS public.recurrence_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    appointment_id uuid UNIQUE REFERENCES public.appointments(id) ON DELETE SET NULL,
    service_client_id uuid REFERENCES public.services_client(id) ON DELETE SET NULL,
    contact_name text,
    service_name text,
    application_name text,
    procedure_date date NOT NULL,
    recurrence_date date NOT NULL,
    approach_1_date date,
    approach_1_status text NOT NULL DEFAULT 'pendente',
    approach_2_date date,
    approach_2_status text NOT NULL DEFAULT 'pendente',
    approach_3_date date,
    approach_3_status text NOT NULL DEFAULT 'pendente',
    scheduled boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Indexes
CREATE INDEX idx_recurrence_tracking_user_id ON public.recurrence_tracking(user_id);
CREATE INDEX idx_recurrence_tracking_recurrence_date ON public.recurrence_tracking(recurrence_date);
CREATE INDEX idx_recurrence_tracking_procedure_date ON public.recurrence_tracking(procedure_date);
CREATE INDEX idx_recurrence_tracking_contact_id ON public.recurrence_tracking(contact_id);

-- 3. RLS
ALTER TABLE public.recurrence_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage recurrence_tracking"
    ON public.recurrence_tracking FOR ALL
    TO authenticated
    USING (user_id = get_owner_id())
    WITH CHECK (user_id = get_owner_id());

-- 4. Trigger function: auto-create recurrence entry when appointment reaches waiting/completed
CREATE OR REPLACE FUNCTION public.fn_create_recurrence_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sc services_client%ROWTYPE;
    v_sn_name text;
    v_contact_name text;
    v_proc_date date;
BEGIN
    -- Only process if status is waiting or completed and has service_id
    IF NEW.status NOT IN ('waiting', 'completed') THEN
        RETURN NEW;
    END IF;

    IF NEW.service_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip if recurrence entry already exists for this appointment
    IF EXISTS (
        SELECT 1 FROM public.recurrence_tracking
        WHERE appointment_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    -- Get services_client data
    SELECT * INTO v_sc
    FROM public.services_client
    WHERE id = NEW.service_id;

    -- Skip if service not found or recurrence not enabled
    IF v_sc.id IS NULL OR v_sc.recurrence IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Skip if expiry_months is not set
    IF v_sc.expiry_months IS NULL OR v_sc.expiry_months <= 0 THEN
        RETURN NEW;
    END IF;

    -- Get parent service name (Toxina Botulinica, etc.)
    SELECT sn.name INTO v_sn_name
    FROM public.service_name sn
    WHERE sn.id = NEW.service_name_id;

    -- Get contact name
    SELECT c.push_name INTO v_contact_name
    FROM public.contacts c
    WHERE c.id = NEW.contact_id;

    -- Procedure date in Brasilia timezone
    v_proc_date := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::date;

    -- Insert recurrence entry
    INSERT INTO public.recurrence_tracking (
        user_id,
        contact_id,
        appointment_id,
        service_client_id,
        contact_name,
        service_name,
        application_name,
        procedure_date,
        recurrence_date,
        approach_1_date,
        approach_2_date,
        approach_3_date
    ) VALUES (
        NEW.user_id,
        NEW.contact_id,
        NEW.id,
        NEW.service_id,
        COALESCE(v_contact_name, 'Cliente'),
        COALESCE(v_sn_name, 'Serviço'),
        COALESCE(NEW.service_name, 'Aplicação'),
        v_proc_date,
        v_proc_date + (v_sc.expiry_months || ' months')::interval,
        CASE WHEN v_sc.time_recurrence_1 IS NOT NULL
             THEN v_proc_date + v_sc.time_recurrence_1
             ELSE NULL END,
        CASE WHEN v_sc.time_recurrence_2 IS NOT NULL
             THEN v_proc_date + v_sc.time_recurrence_2
             ELSE NULL END,
        CASE WHEN v_sc.time_recurrence_3 IS NOT NULL
             THEN v_proc_date + v_sc.time_recurrence_3
             ELSE NULL END
    )
    ON CONFLICT (appointment_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- 5. Attach trigger to appointments table
CREATE TRIGGER trg_recurrence_on_appointment
    AFTER INSERT OR UPDATE OF status
    ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_create_recurrence_on_appointment();

-- 6. Seed: fill time_recurrence_1 and time_recurrence_3 for existing services
UPDATE public.services_client
SET time_recurrence_1 = 150,
    updated_at = now()
WHERE recurrence = true
  AND time_recurrence_1 IS NULL
  AND time_recurrence_2 IS NOT NULL;

UPDATE public.services_client
SET time_recurrence_3 = 210,
    updated_at = now()
WHERE recurrence = true
  AND time_recurrence_3 IS NULL
  AND time_recurrence_2 IS NOT NULL;

-- 7. Backfill: generate recurrence entries for existing qualifying appointments
INSERT INTO public.recurrence_tracking (
    user_id, contact_id, appointment_id, service_client_id,
    contact_name, service_name, application_name,
    procedure_date, recurrence_date,
    approach_1_date, approach_2_date, approach_3_date
)
SELECT
    a.user_id,
    a.contact_id,
    a.id,
    a.service_id,
    COALESCE(c.push_name, 'Cliente'),
    COALESCE(sn.name, 'Serviço'),
    COALESCE(a.service_name, 'Aplicação'),
    (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date,
    (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date + (sc.expiry_months || ' months')::interval,
    CASE WHEN sc.time_recurrence_1 IS NOT NULL
         THEN (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date + sc.time_recurrence_1
         ELSE NULL END,
    CASE WHEN sc.time_recurrence_2 IS NOT NULL
         THEN (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date + sc.time_recurrence_2
         ELSE NULL END,
    CASE WHEN sc.time_recurrence_3 IS NOT NULL
         THEN (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date + sc.time_recurrence_3
         ELSE NULL END
FROM public.appointments a
JOIN public.services_client sc ON sc.id = a.service_id
LEFT JOIN public.service_name sn ON sn.id = a.service_name_id
LEFT JOIN public.contacts c ON c.id = a.contact_id
WHERE a.status IN ('waiting', 'completed')
  AND a.service_id IS NOT NULL
  AND sc.recurrence = true
  AND sc.expiry_months IS NOT NULL
  AND sc.expiry_months > 0
ON CONFLICT (appointment_id) DO NOTHING;
