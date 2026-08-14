-- Categorias de serviço criadas pelo usuário (user_id NULL = template global)
ALTER TABLE public.services_category
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_category_user ON public.services_category(user_id);

-- RLS: leitura de templates globais + categorias do time; escrita só nas do time
DROP POLICY IF EXISTS "Authenticated read categories" ON public.services_category;
DROP POLICY IF EXISTS "Read template and team categories" ON public.services_category;
DROP POLICY IF EXISTS "Team insert categories" ON public.services_category;
DROP POLICY IF EXISTS "Team update categories" ON public.services_category;
DROP POLICY IF EXISTS "Team delete categories" ON public.services_category;

CREATE POLICY "Read template and team categories" ON public.services_category
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = get_owner_id());

CREATE POLICY "Team insert categories" ON public.services_category
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team update categories" ON public.services_category
  FOR UPDATE TO authenticated
  USING (user_id = get_owner_id());

CREATE POLICY "Team delete categories" ON public.services_category
  FOR DELETE TO authenticated
  USING (user_id = get_owner_id());
