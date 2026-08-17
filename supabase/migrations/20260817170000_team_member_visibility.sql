-- USER RULE (2026-08-17): membro Atendente (agent) tem escopo de visibilidade:
--   allowed_instance_ids = instâncias que pode ver (NULL = todas)
--   assigned_queue_ids   = filas que pode ver   (NULL = todas)
-- Admin/supervisor sempre veem tudo (colunas ignoradas para esses papéis).
ALTER TABLE public.team_members
    ADD COLUMN IF NOT EXISTS allowed_instance_ids UUID[] DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS assigned_queue_ids UUID[] DEFAULT NULL;
