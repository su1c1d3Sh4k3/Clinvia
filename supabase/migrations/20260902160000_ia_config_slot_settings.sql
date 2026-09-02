-- Tamanho do slot de agendamento + folga entre atendimentos (IA, API e link publico).
-- Ate aqui o passo da grade era fixo em 10 min dentro das edge functions e nao
-- existia nenhuma folga entre um atendimento e o seguinte.

ALTER TABLE public.ia_config
    ADD COLUMN IF NOT EXISTS slot_minutes INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS slot_buffer_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.ia_config
    DROP CONSTRAINT IF EXISTS ia_config_slot_minutes_check;
ALTER TABLE public.ia_config
    ADD CONSTRAINT ia_config_slot_minutes_check CHECK (slot_minutes BETWEEN 5 AND 240);

ALTER TABLE public.ia_config
    DROP CONSTRAINT IF EXISTS ia_config_slot_buffer_minutes_check;
ALTER TABLE public.ia_config
    ADD CONSTRAINT ia_config_slot_buffer_minutes_check CHECK (slot_buffer_minutes BETWEEN 0 AND 240);

COMMENT ON COLUMN public.ia_config.slot_minutes IS
    'Passo da grade de horarios oferecidos pela IA / API / link publico, em minutos.';
COMMENT ON COLUMN public.ia_config.slot_buffer_minutes IS
    'Folga exigida antes E depois de cada agendamento existente, em minutos (0 = sem folga).';
