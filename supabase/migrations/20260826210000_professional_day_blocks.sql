-- Fechar a agenda de um profissional em um dia específico.
--
-- Uma linha por (profissional, dia) = agenda fechada: nenhum horário fica
-- disponível naquela data, nem pela agenda, nem pelo modal, nem pelas APIs
-- (api-availability, api-scheduling, api-public-booking, slot-engine).
-- Remover a linha reabre o dia. Nada é gravado em `appointments`.

CREATE TABLE IF NOT EXISTS public.professional_day_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_professional_day_block UNIQUE (professional_id, block_date)
);

CREATE INDEX IF NOT EXISTS idx_professional_day_blocks_date
  ON public.professional_day_blocks (block_date, professional_id);

CREATE INDEX IF NOT EXISTS idx_professional_day_blocks_user
  ON public.professional_day_blocks (user_id, block_date);

COMMENT ON TABLE public.professional_day_blocks IS
  'Dias com a agenda fechada por profissional. A presença da linha bloqueia todos os slots daquela data.';

ALTER TABLE public.professional_day_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_day_blocks_select ON public.professional_day_blocks;
CREATE POLICY professional_day_blocks_select ON public.professional_day_blocks
  FOR SELECT USING (user_id = public.get_owner_id());

DROP POLICY IF EXISTS professional_day_blocks_insert ON public.professional_day_blocks;
CREATE POLICY professional_day_blocks_insert ON public.professional_day_blocks
  FOR INSERT WITH CHECK (user_id = public.get_owner_id());

DROP POLICY IF EXISTS professional_day_blocks_delete ON public.professional_day_blocks;
CREATE POLICY professional_day_blocks_delete ON public.professional_day_blocks
  FOR DELETE USING (user_id = public.get_owner_id());

GRANT SELECT, INSERT, DELETE ON public.professional_day_blocks TO authenticated;
GRANT ALL ON public.professional_day_blocks TO service_role;

NOTIFY pgrst, 'reload schema';
