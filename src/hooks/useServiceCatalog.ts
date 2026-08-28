// Catálogo GLOBAL de templates de serviços (tabelas service_catalog_*).
// Usado só pelo botão "Utilizar templates" em /products-services — essas tabelas
// são separadas de services_category/service_name para o catálogo nunca aparecer
// nos selects de nenhum tenant.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CatalogApplication {
  id: string;
  service_id: string;
  slug: string;
  name_upper: string;
  name_normal: string;
  description: string | null;
  price: number;
  min_price: number | null;
  expiry_months: number | null;
  session_interval: number | null;
  duration_minutes: number | null;
  sort_order: number;
}

export interface CatalogService {
  id: string;
  category_id: string;
  slug: string;
  name_upper: string;
  name_normal: string;
  description: string | null;
  recurrence: boolean;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
  recurrence_discount_pct_1: number | null;
  recurrence_discount_pct_2: number | null;
  recurrence_discount_pct_3: number | null;
  sort_order: number;
  applications: CatalogApplication[];
}

export interface CatalogCategory {
  id: string;
  slug: string;
  name_upper: string;
  name_normal: string;
  category_type: "standard" | "direct";
  sort_order: number;
  services: CatalogService[];
}

export const useServiceCatalog = (enabled: boolean) =>
  useQuery({
    queryKey: ["service-catalog"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CatalogCategory[]> => {
      const [cats, svcs, apps] = await Promise.all([
        supabase.from("service_catalog_categories" as any).select("*").order("sort_order"),
        supabase.from("service_catalog_services" as any).select("*").order("sort_order"),
        supabase.from("service_catalog_applications" as any).select("*").order("sort_order"),
      ]);
      if (cats.error) throw cats.error;
      if (svcs.error) throw svcs.error;
      if (apps.error) throw apps.error;

      const appsByService = new Map<string, CatalogApplication[]>();
      for (const app of (apps.data || []) as unknown as CatalogApplication[]) {
        const list = appsByService.get(app.service_id) || [];
        list.push(app);
        appsByService.set(app.service_id, list);
      }

      const svcsByCategory = new Map<string, CatalogService[]>();
      for (const svc of (svcs.data || []) as unknown as CatalogService[]) {
        const list = svcsByCategory.get(svc.category_id) || [];
        list.push({ ...svc, applications: appsByService.get(svc.id) || [] });
        svcsByCategory.set(svc.category_id, list);
      }

      return ((cats.data || []) as unknown as CatalogCategory[]).map((cat) => ({
        ...cat,
        services: svcsByCategory.get(cat.id) || [],
      }));
    },
  });
