import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseFile(file: File): Promise<ParsedSheet> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv") return parseCsv(file);
  if (ext === "xlsx" || ext === "xls") return parseXlsx(file);
  return Promise.reject(new Error("Formato não suportado. Use .xlsx, .xls ou .csv"));
}

function parseCsv(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || [];
        const rows = (result.data as Record<string, string>[]).map((row) => {
          const clean: Record<string, string> = {};
          for (const h of headers) clean[h] = String(row[h] ?? "").trim();
          return clean;
        });
        resolve({ headers, rows });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  if (json.length === 0) throw new Error("Planilha sem dados");
  const headers = Object.keys(json[0]);
  const rows = json.map((row) => {
    const clean: Record<string, string> = {};
    for (const h of headers) clean[h] = String(row[h] ?? "").trim();
    return clean;
  });
  return { headers, rows };
}
