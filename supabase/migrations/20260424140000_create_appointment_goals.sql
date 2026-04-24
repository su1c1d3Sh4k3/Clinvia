-- =====================================================
-- Appointment Goals: metas mensais de agendamentos
-- =====================================================
-- Uma meta por (user_id, month, year). Permite historico mes-a-mes.
-- Usada pelo relatorio de agendamentos para acompanhar progresso vs realizado.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.appointment_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    target INTEGER NOT NULL CHECK (target >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_appointment_goals_user_month
    ON public.appointment_goals(user_id, year, month);

-- Trigger updated_at (reutiliza função já existente no schema)
DROP TRIGGER IF EXISTS trg_appointment_goals_updated_at ON public.appointment_goals;
CREATE TRIGGER trg_appointment_goals_updated_at
    BEFORE UPDATE ON public.appointment_goals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: owner da organização lê/escreve só os registros dele.
ALTER TABLE public.appointment_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read own goals" ON public.appointment_goals;
CREATE POLICY "owner can read own goals" ON public.appointment_goals
    FOR SELECT USING (
        user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS "owner can insert own goals" ON public.appointment_goals;
CREATE POLICY "owner can insert own goals" ON public.appointment_goals
    FOR INSERT WITH CHECK (
        user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS "owner can update own goals" ON public.appointment_goals;
CREATE POLICY "owner can update own goals" ON public.appointment_goals
    FOR UPDATE USING (
        user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS "owner can delete own goals" ON public.appointment_goals;
CREATE POLICY "owner can delete own goals" ON public.appointment_goals
    FOR DELETE USING (
        user_id IN (SELECT user_id FROM public.team_members WHERE auth_user_id = auth.uid())
        OR user_id = auth.uid()
    );

COMMENT ON TABLE public.appointment_goals
    IS 'Metas mensais de agendamentos por owner. Uma meta por (user_id, month, year).';
COMMENT ON COLUMN public.appointment_goals.target IS 'Número de agendamentos alvo no mês';
