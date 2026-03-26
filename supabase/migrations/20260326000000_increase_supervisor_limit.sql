-- Aumenta o limite de supervisores por conta de 1 para 3
-- O trigger enforce_one_supervisor já existe e continua chamando esta função
CREATE OR REPLACE FUNCTION check_supervisor_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'supervisor' THEN
    IF (
      SELECT COUNT(*) FROM public.team_members
      WHERE role = 'supervisor'
        AND user_id = NEW.user_id
        AND id != NEW.id
    ) >= 3 THEN
      RAISE EXCEPTION 'Maximum of 3 supervisors allowed per account.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
