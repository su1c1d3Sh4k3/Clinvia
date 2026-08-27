ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS agenda_view text NOT NULL DEFAULT 'grade';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_members_agenda_view_check'
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_agenda_view_check
      CHECK (agenda_view IN ('grade', 'calendario'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
