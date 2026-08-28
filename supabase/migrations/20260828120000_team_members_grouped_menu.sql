-- Menu lateral agrupado (Atendimento / Cadastros / Marketing) — preferencia de
-- CADA pessoa que acessa o sistema, igual a team_members.agenda_view
-- (20260827220000): profiles so tem linha para donos de conta.
-- Padrao = agrupado; o switch fica em Configuracoes > Sistema.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS grouped_menu BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
