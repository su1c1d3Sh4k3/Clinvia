-- =============================================
-- Migração: Corrige trigger de limite de supervisor por conta
-- Data: 2026-03-24
-- Problema: check_supervisor_limit verificava supervisores em TODAS as contas
--           (faltava filtro por user_id). Qualquer conta com supervisor
--           bloqueava todas as outras de criar supervisores.
-- =============================================

CREATE OR REPLACE FUNCTION check_supervisor_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'supervisor' THEN
    IF EXISTS (
      SELECT 1 FROM public.team_members
      WHERE role = 'supervisor'
        AND user_id = NEW.user_id
        AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Only one supervisor is allowed per account.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
