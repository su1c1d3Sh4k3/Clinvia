import { supabase } from "@/integrations/supabase/client";
import { ValidatedRow } from "./importTransformers";

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function importContacts(
  validRows: ValidatedRow[],
  ownerId: string,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const total = validRows.length;

  // Match by last 8 digits (system-wide pattern): existing contacts may be stored
  // as "5511999999999", "5511999999999@s.whatsapp.net" or without the 9th digit.
  const last8 = (n: string) => n.split("@")[0].replace(/\D/g, "").slice(-8);

  // Fetch all owner's contacts once for deduplication
  const existingMap = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("contacts")
      .select("id, number")
      .eq("user_id", ownerId)
      .range(from, from + PAGE - 1);
    if (error) {
      result.errors.push(`Erro ao buscar contatos existentes: ${error.message}`);
      return result;
    }
    for (const c of page || []) {
      const key = last8(c.number || "");
      if (key && !existingMap.has(key)) existingMap.set(key, c.id);
    }
    if (!page || page.length < PAGE) break;
  }

  // Track numbers inserted in this import to avoid duplicates within the sheet
  const seenInSheet = new Set<string>();

  // Process in batches of 50
  const BATCH = 50;
  for (let i = 0; i < validRows.length; i += BATCH) {
    const batch = validRows.slice(i, i + BATCH);
    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];

    for (const row of batch) {
      if (row.status === "error") {
        result.skipped++;
        continue;
      }

      const key = last8(row.data.number || "");

      // Duplicate within the sheet → skip (first occurrence wins)
      if (seenInSheet.has(key)) {
        result.skipped++;
        continue;
      }
      seenInSheet.add(key);

      const existingId = existingMap.get(key);
      if (existingId) {
        // Update only empty fields
        const updates: any = {};
        if (row.data.email) updates.email = row.data.email;
        if (row.data.cpf) updates.cpf = row.data.cpf;
        if (row.data.company) updates.company = row.data.company;
        if (row.data.instagram) updates.instagram = row.data.instagram;
        if (row.data.phone) updates.phone = row.data.phone;
        if (Object.keys(updates).length > 0) {
          toUpdate.push({ id: existingId, data: updates });
        }
        result.updated++;
      } else {
        toInsert.push({
          user_id: ownerId,
          number: row.data.number,
          push_name: row.data.push_name,
          email: row.data.email,
          cpf: row.data.cpf,
          company: row.data.company,
          instagram: row.data.instagram,
          phone: row.data.phone,
          channel: "whatsapp",
          patient: true,
        });
      }
    }

    // Batch insert; on failure retry row-by-row so one bad row doesn't skip the batch
    if (toInsert.length > 0) {
      const { error } = await supabase.from("contacts").insert(toInsert);
      if (error) {
        for (const contact of toInsert) {
          const { error: rowError } = await supabase.from("contacts").insert(contact);
          if (rowError) {
            result.skipped++;
            result.errors.push(`${contact.push_name || contact.number}: ${rowError.message}`);
          } else {
            result.imported++;
          }
        }
      } else {
        result.imported += toInsert.length;
      }
    }

    // Individual updates (can't batch different where clauses)
    for (const u of toUpdate) {
      await supabase.from("contacts").update(u.data).eq("id", u.id);
    }

    onProgress?.(Math.min(i + BATCH, total), total);
  }

  return result;
}
