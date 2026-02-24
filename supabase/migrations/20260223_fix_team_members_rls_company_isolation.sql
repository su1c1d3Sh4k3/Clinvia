-- ============================================
-- FIX: team_members RLS — Remover policy com subquery auto-referencial
--
-- HISTORICO:
--   1) Existia policy com USING(true) que permitia qualquer autenticado ver todos
--   2) Tentamos substituir por policy com subquery em team_members (auto-referencial)
--   3) Isso causou recursao RLS e impediu membros de verem seus proprios registros
--   4) SOLUCAO: Remover policy problematica. A policy existente
--      "Qualquer membro autenticado pode ver a equipe da mesma empresa"
--      ja faz isolamento correto usando get_my_owner_id() (SECURITY DEFINER)
--
-- Policies finais em team_members:
--   - "Apenas admins podem gerenciar membros" (ALL) -> is_admin() SECURITY DEFINER
--   - "Membros podem atualizar o proprio perfil" (UPDATE) -> auth_user_id = auth.uid()
--   - "Qualquer membro autenticado pode ver a equipe da mesma empresa" (SELECT) -> user_id = get_my_owner_id()
-- ============================================

-- Remover policy com USING(true) (caso ainda exista)
DROP POLICY IF EXISTS "Qualquer membro autenticado pode ver a equipe" ON public.team_members;

-- Remover policy auto-referencial (causava recursao RLS)
DROP POLICY IF EXISTS "Membros veem apenas equipe da propria empresa" ON public.team_members;

-- A policy "Qualquer membro autenticado pode ver a equipe da mesma empresa"
-- ja existe e usa get_my_owner_id() (SECURITY DEFINER) para isolamento seguro.
-- Nao precisa criar nenhuma policy nova.
