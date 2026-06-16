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

  // Fetch existing contacts by number for deduplication
  const numbers = validRows.map((r) => r.data.number).filter(Boolean);
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, number")
    .in("number", numbers);

  const existingMap = new Map((existing || []).map((c) => [c.number, c.id]));

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

      const existingId = existingMap.get(row.data.number);
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

    // Batch insert
    if (toInsert.length > 0) {
      const { error } = await supabase.from("contacts").insert(toInsert);
      if (error) {
        result.errors.push(`Erro no lote ${i / BATCH + 1}: ${error.message}`);
        result.skipped += toInsert.length;
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
