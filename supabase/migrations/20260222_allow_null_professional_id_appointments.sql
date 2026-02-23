-- Permite professional_id NULL em appointments
-- Necessário para importar bloqueios do Google Calendar em conexões de clínica (sem profissional específico)
ALTER TABLE public.appointments ALTER COLUMN professional_id DROP NOT NULL;
