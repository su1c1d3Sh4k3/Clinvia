// Importa o catálogo de templates (service_catalog_*) para as tabelas do tenant.
// Regra do cliente: categoria/serviço que já existe é REAPROVEITADO — nunca
// substituído. Aplicação com o mesmo nome no mesmo serviço é ignorada.
import { supabase } from "@/integrations/supabase/client";
import { syncRecurrenceTemplates } from "@/lib/recurrenceTemplateSync";

export const normalizeTxt = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface TemplateImportApplication {
  name: string;
  description: string | null;
  price: number;
  minPrice: number | null;
  expiryMonths: number | null;
  sessionInterval: number | null;
  durationMinutes: number | null;
  commissionPct: number;
}

export interface TemplateImportService {
  name: string;
  description: string | null;
  recurrence: boolean;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
  recurrence_discount_pct_1: number | null;
  recurrence_discount_pct_2: number | null;
  recurrence_discount_pct_3: number | null;
  msg_recurrence_1: string | null;
  msg_recurrence_2: string | null;
  msg_recurrence_3: string | null;
  applications: TemplateImportApplication[];
}

export interface TemplateImportCategory {
  name: string;
  categoryType: "standard" | "direct";
  services: TemplateImportService[];
}

export interface TemplateImportResult {
  categoriesCreated: number;
  servicesCreated: number;
  applicationsCreated: number;
  applicationsSkipped: number;
}

export async function importServiceTemplates(
  ownerId: string,
  categories: TemplateImportCategory[],
): Promise<TemplateImportResult> {
  const result: TemplateImportResult = {
    categoriesCreated: 0,
    servicesCreated: 0,
    applicationsCreated: 0,
    applicationsSkipped: 0,
  };

  const [existingCats, existingSvcs, existingApps] = await Promise.all([
    supabase.from("services_category" as any).select("id, name"),
    supabase.from("service_name" as any).select("id, category_id, name"),
    supabase.from("services_client" as any).select("id, service_name_id, name"),
  ]);
  if (existingCats.error) throw existingCats.error;
  if (existingSvcs.error) throw existingSvcs.error;
  if (existingApps.error) throw existingApps.error;

  const catByName = new Map<string, string>();
  for (const c of (existingCats.data || []) as any[]) {
    catByName.set(normalizeTxt(c.name), c.id);
  }
  const svcByCatName = new Map<string, string>();
  for (const s of (existingSvcs.data || []) as any[]) {
    svcByCatName.set(`${s.category_id}::${normalizeTxt(s.name)}`, s.id);
  }
  const appKeys = new Set<string>();
  for (const a of (existingApps.data || []) as any[]) {
    appKeys.add(`${a.service_name_id}::${normalizeTxt(a.name)}`);
  }

  const rows: Record<string, unknown>[] = [];
  const customServiceIds: string[] = [];

  for (const cat of categories) {
    if (cat.services.length === 0) continue;

    let categoryId = catByName.get(normalizeTxt(cat.name));
    if (!categoryId) {
      const { data, error } = await supabase
        .from("services_category" as any)
        .insert({ name: cat.name, category_type: cat.categoryType, user_id: ownerId })
        .select("id")
        .single();
      if (error) throw error;
      categoryId = (data as any).id as string;
      catByName.set(normalizeTxt(cat.name), categoryId);
      result.categoriesCreated++;
    }

    for (const svc of cat.services) {
      if (svc.applications.length === 0) continue;

      const svcKey = `${categoryId}::${normalizeTxt(svc.name)}`;
      let serviceNameId = svcByCatName.get(svcKey);
      const hasCustomMsgs = [svc.msg_recurrence_1, svc.msg_recurrence_2, svc.msg_recurrence_3].some(
        (m) => (m || "").trim() !== "",
      );

      if (!serviceNameId) {
        const { data, error } = await supabase
          .from("service_name" as any)
          .insert({
            category_id: categoryId,
            user_id: ownerId,
            name: svc.name,
            description: svc.description || null,
            recurrence: svc.recurrence,
            time_recurrence_1: svc.time_recurrence_1,
            time_recurrence_2: svc.time_recurrence_2,
            time_recurrence_3: svc.time_recurrence_3,
            recurrence_discount_pct_1: svc.recurrence_discount_pct_1,
            recurrence_discount_pct_2: svc.recurrence_discount_pct_2,
            recurrence_discount_pct_3: svc.recurrence_discount_pct_3,
            msg_recurrence_1: svc.msg_recurrence_1 || null,
            msg_recurrence_2: svc.msg_recurrence_2 || null,
            msg_recurrence_3: svc.msg_recurrence_3 || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        serviceNameId = (data as any).id as string;
        svcByCatName.set(svcKey, serviceNameId);
        result.servicesCreated++;
        if (hasCustomMsgs) customServiceIds.push(serviceNameId);
      }

      for (const app of svc.applications) {
        const appKey = `${serviceNameId}::${normalizeTxt(app.name)}`;
        if (appKeys.has(appKey)) {
          result.applicationsSkipped++;
          continue;
        }
        appKeys.add(appKey);
        rows.push({
          user_id: ownerId,
          category_id: categoryId,
          service_name_id: serviceNameId,
          name: app.name,
          description: app.description || null,
          price: app.price,
          min_price: app.minPrice ?? 0,
          status: true,
          expiry_months: app.expiryMonths ?? 0,
          session_interval: app.sessionInterval,
          duration_minutes: app.durationMinutes,
          professionals: [],
          commission_pct: app.commissionPct,
        });
      }
    }
  }

  // Insere em lotes (PostgREST tem limite prático de payload)
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("services_client" as any)
      .insert(rows.slice(i, i + BATCH))
      .select("id");
    if (error) throw error;
    result.applicationsCreated += Math.min(BATCH, rows.length - i);
  }

  // Templates personalizados → aprovação da Meta (no-op sem instância Meta)
  if (customServiceIds.length > 0) {
    syncRecurrenceTemplates({ serviceNameIds: customServiceIds });
  }

  return result;
}
