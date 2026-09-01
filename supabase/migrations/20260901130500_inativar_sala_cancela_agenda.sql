-- Inativar uma sala tira ela da agenda: os agendamentos futuros que ainda
-- estavam de pé passam a "canceled". O passado é preservado para os relatórios.

CREATE OR REPLACE FUNCTION public.cancel_future_appointments_on_sala_inactive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.active AND NOT NEW.active THEN
        UPDATE public.appointments
           SET status = 'canceled', updated_at = now()
         WHERE professional_id = NEW.id
           AND start_time > now()
           AND coalesce(status::text, '') NOT IN ('canceled', 'cancelled', 'no_show', 'completed');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_appts_on_sala_inactive ON public.professionals;
CREATE TRIGGER trg_cancel_appts_on_sala_inactive
    AFTER UPDATE OF active ON public.professionals
    FOR EACH ROW EXECUTE FUNCTION public.cancel_future_appointments_on_sala_inactive();

-- Quantos agendamentos futuros seriam cancelados — o front avisa antes de inativar.
CREATE OR REPLACE FUNCTION public.count_future_appointments(p_professional_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*)::int
      FROM public.appointments a
     WHERE a.professional_id = p_professional_id
       AND a.start_time > now()
       AND coalesce(a.status::text, '') NOT IN ('canceled', 'cancelled', 'no_show', 'completed');
$$;

GRANT EXECUTE ON FUNCTION public.count_future_appointments(uuid) TO authenticated;
