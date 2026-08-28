-- Catalogo GLOBAL de templates de servicos (botao "Utilizar templates" em /products-services).
-- Tabelas proprias, separadas de services_category/service_name/service_applications:
-- o catalogo NAO pode aparecer nos selects de nenhum tenant, so dentro do modal de importacao.

CREATE TABLE IF NOT EXISTS public.service_catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_upper TEXT NOT NULL,
  name_normal TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'standard',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_catalog_categories_type_chk CHECK (category_type IN ('standard', 'direct'))
);

CREATE TABLE IF NOT EXISTS public.service_catalog_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.service_catalog_categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name_upper TEXT NOT NULL,
  name_normal TEXT NOT NULL,
  description TEXT,
  recurrence BOOLEAN NOT NULL DEFAULT TRUE,
  time_recurrence_1 INT,
  time_recurrence_2 INT,
  time_recurrence_3 INT,
  recurrence_discount_pct_1 NUMERIC,
  recurrence_discount_pct_2 NUMERIC,
  recurrence_discount_pct_3 NUMERIC,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_catalog_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.service_catalog_services(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name_upper TEXT NOT NULL,
  name_normal TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  min_price NUMERIC,
  expiry_months INT,
  session_interval INT,
  duration_minutes INT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_services_category
  ON public.service_catalog_services(category_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_applications_service
  ON public.service_catalog_applications(service_id);

-- Leitura liberada para qualquer usuario logado (o catalogo e o mesmo para todo mundo).
-- Escrita: nenhuma policy => so service_role/super-admin via SQL.
ALTER TABLE public.service_catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_catalog_categories_read ON public.service_catalog_categories;
CREATE POLICY service_catalog_categories_read ON public.service_catalog_categories
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS service_catalog_services_read ON public.service_catalog_services;
CREATE POLICY service_catalog_services_read ON public.service_catalog_services
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS service_catalog_applications_read ON public.service_catalog_applications;
CREATE POLICY service_catalog_applications_read ON public.service_catalog_applications
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON public.service_catalog_categories TO authenticated;
GRANT SELECT ON public.service_catalog_services TO authenticated;
GRANT SELECT ON public.service_catalog_applications TO authenticated;

NOTIFY pgrst, 'reload schema';
