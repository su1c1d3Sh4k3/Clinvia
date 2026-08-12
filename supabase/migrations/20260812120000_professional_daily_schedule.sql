-- Horário de atendimento individual por dia da semana para profissionais.
-- use_daily_schedule: switch on/off (off = usa work_hours global, comportamento atual)
-- work_hours_daily: JSONB { "1": {"start":"08:00","end":"18:00","break_start":"12:00","break_end":"13:00"}, ... }
--   chaves = dia da semana (0=Dom..6=Sáb). Preservado ao desligar o switch (religa e volta a última config).
ALTER TABLE public.professionals
    ADD COLUMN IF NOT EXISTS use_daily_schedule BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS work_hours_daily JSONB DEFAULT NULL;
