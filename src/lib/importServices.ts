import { supabase } from "@/integrations/supabase/client";
import { ValidatedRow } from "./importTransformers";

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function importServices(
  validRows: ValidatedRow[],
  ownerId: string,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const total = validRows.length;

  // Cache for created/found entities to avoid duplicate lookups
  const categoryCache = new Map<string, string>(); // name → id
  const serviceNameCache = new Map<string, string>(); // "catId|name" → id

  // Pre-load existing categories and service_names
  const { data: existingCats } = await supabase
    .from("services_category" as any).select("id, name");
  for (const c of existingCats || []) {
    categoryCache.set(c.name.toLowerCase(), c.id);
  }

  const { data: existingSns } = await supabase
    .from("service_name" as any).select("id, category_id, name");
  for (const s of existingSns || []) {
    serviceNameCache.set(`${s.category_id}|${s.name.toLowerCase()}`, s.id);
  }

  // Pre-load existing services_client for deduplication
  const { data: existingScs } = await supabase
    .from("services_client" as any).select("id, service_name_id, name")
    .eq("user_id", ownerId);
  const scCache = new Map<string, string>(); // "snId|name" → id
  for (const sc of existingScs || []) {
    scCache.set(`${sc.service_name_id}|${sc.name.toLowerCase()}`, sc.id);
  }

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    if (row.status === "error") {
      result.skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    try {
      // 1. Find or create category
      const catKey = row.data.category.toLowerCase();
      let categoryId = categoryCache.get(catKey);
      if (!categoryId) {
        const { data: newCat, error } = await supabase
          .from("services_category" as any)
          .insert({ name: row.data.category, category_type: "standard" })
          .select("id").single();
        if (error) throw error;
        categoryId = newCat.id;
        categoryCache.set(catKey, categoryId);
      }

      // 2. Find or create service_name
      const snKey = `${categoryId}|${row.data.service.toLowerCase()}`;
      let serviceNameId = serviceNameCache.get(snKey);
      if (!serviceNameId) {
        const { data: newSn, error } = await supabase
          .from("service_name" as any)
          .insert({ category_id: categoryId, name: row.data.service })
          .select("id").single();
        if (error) throw error;
        serviceNameId = newSn.id;
        serviceNameCache.set(snKey, serviceNameId);
      }

      // 3. Find or create services_client (application)
      const scKey = `${serviceNameId}|${row.data.application.toLowerCase()}`;
      if (scCache.has(scKey)) {
        result.updated++;
      } else {
        const { data: newSc, error } = await supabase
          .from("services_client" as any)
          .insert({
            user_id: ownerId,
            category_id: categoryId,
            service_name_id: serviceNameId,
            name: row.data.application,
            price: row.data.price || 0,
            min_price: row.data.min_price || 0,
            duration_minutes: row.data.duration || null,
            description: row.data.description || null,
            status: true,
            professionals: [],
          })
          .select("id").single();
        if (error) throw error;
        scCache.set(scKey, newSc.id);
        result.imported++;
      }
    } catch (err: any) {
      result.errors.push(`Linha ${i + 1}: ${err.message}`);
      result.skipped++;
    }

    onProgress?.(i + 1, total);
  }

  return result;
}
