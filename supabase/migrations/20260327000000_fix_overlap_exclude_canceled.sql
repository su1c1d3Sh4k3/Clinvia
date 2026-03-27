-- Corrige check_appointment_overlap para ignorar agendamentos cancelados
-- Agendamentos com status 'canceled' não devem bloquear horários
CREATE OR REPLACE FUNCTION check_appointment_overlap(
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    overlap_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO overlap_count
    FROM public.appointments
    WHERE professional_id = p_professional_id
    AND (id != p_exclude_id OR p_exclude_id IS NULL)
    AND status != 'canceled'
    AND start_time < p_end_time
    AND end_time > p_start_time;

    RETURN overlap_count > 0;
END;
$$;
