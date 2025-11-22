-- Fix calculate_speed_score function to include search_path
CREATE OR REPLACE FUNCTION public.calculate_speed_score(duration_seconds INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  IF duration_seconds <= 180 THEN
    RETURN 10; -- 0-3 min: Excelente
  ELSIF duration_seconds <= 360 THEN
    -- 3-6 min: Linear 9 to 6
    RETURN 9 - ((duration_seconds - 180) * 3.0 / 180);
  ELSIF duration_seconds <= 600 THEN
    -- 6-10 min: Linear 5 to 3
    RETURN 5 - ((duration_seconds - 360) * 2.0 / 240);
  ELSIF duration_seconds <= 900 THEN
    -- 10-15 min: Linear 2 to 1
    RETURN 2 - ((duration_seconds - 600) * 1.0 / 300);
  ELSE
    RETURN 0; -- >15 min: Muito demorado
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;