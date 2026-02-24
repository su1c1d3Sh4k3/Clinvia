-- ============================================
-- FIX: team_members RLS — USING(true) → isolamento por empresa
-- Problema: Qualquer autenticado podia ver TODOS os team_members de TODAS as empresas
-- Fix: Só vê membros da própria empresa (user_id = owner da empresa)
-- ============================================

-- Remover policy permissiva
DROP POLICY IF EXISTS "Qualquer membro autenticado pode ver a equipe" ON public.team_members;

-- Nova policy: Só vê membros da mesma empresa
CREATE POLICY "Membros veem apenas equipe da propria empresa"
ON public.team_members FOR SELECT
TO authenticated
USING (
  -- Owner da empresa vê todos os seus membros
  user_id = auth.uid()
  -- Membro da equipe vê colegas da mesma empresa
  OR user_id IN (
    SELECT tm.user_id FROM public.team_members tm
    WHERE tm.auth_user_id = auth.uid()
  )
);
