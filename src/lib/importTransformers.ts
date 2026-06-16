/** Normalize phone to WhatsApp format: 5511999999999@s.whatsapp.net */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Strip everything except digits and +
  let digits = raw.replace(/[^\d+]/g, "");
  // Remove leading +
  digits = digits.replace(/^\+/, "");
  // If starts with 0, assume local BR number — prepend 55
  if (digits.startsWith("0")) digits = "55" + digits.slice(1);
  // If 10-11 digits (no country code), prepend 55
  if (digits.length <= 11) digits = "55" + digits;
  // Must be 12-13 digits for BR
  if (digits.length < 12 || digits.length > 13) return "";
  return digits + "@s.whatsapp.net";
}

/** Extract just digits from phone (for display/phone field) */
export function extractPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Normalize CPF: remove dots and dashes */
export function normalizeCpf(raw: string): string {
  return raw.replace(/[.\-/\s]/g, "");
}

/** Normalize price: "R$ 1.290,00" → 1290.00 */
export function normalizePrice(raw: string): number {
  if (!raw) return 0;
  let cleaned = raw.replace(/[R$\s]/g, "");
  // BR format: 1.290,50 → detect by comma before last 2 digits
  if (/\d\.\d{3}/.test(cleaned) || cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/** Normalize name: trim + title case */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

/** Normalize email: trim + lowercase */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Normalize duration string to minutes number */
export function normalizeDuration(raw: string): number | null {
  if (!raw) return null;
  const num = parseInt(raw.replace(/\D/g, ""));
  return isNaN(num) || num <= 0 ? null : num;
}

export type ValidationStatus = "valid" | "warning" | "error";

export interface ValidatedRow {
  data: Record<string, any>;
  status: ValidationStatus;
  errors: string[];
}

/** Validate and transform a row of contact data */
export function validateContactRow(
  row: Record<string, string>,
  mapping: Record<string, string>
): ValidatedRow {
  const errors: string[] = [];
  const data: Record<string, any> = {};

  // Find which header maps to which field
  const reverseMap: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    reverseMap[field] = row[header] || "";
  }

  // Name
  const name = normalizeName(reverseMap.push_name || "");
  if (!name) errors.push("Nome é obrigatório");
  data.push_name = name;

  // WhatsApp
  const whatsapp = normalizePhone(reverseMap.number || "");
  if (!whatsapp) errors.push("WhatsApp inválido");
  data.number = whatsapp;

  // Optional fields
  data.email = reverseMap.email ? normalizeEmail(reverseMap.email) : null;
  data.cpf = reverseMap.cpf ? normalizeCpf(reverseMap.cpf) : null;
  data.company = reverseMap.company?.trim() || null;
  data.instagram = reverseMap.instagram?.trim().replace(/^@/, "") || null;
  data.phone = reverseMap.phone ? extractPhoneDigits(reverseMap.phone) : null;

  const status: ValidationStatus = errors.length > 0 ? "error" : (!data.email && !data.cpf ? "warning" : "valid");
  if (status === "warning") errors.push("Sem email e CPF");

  return { data, status, errors };
}

/** Validate and transform a row of service data */
export function validateServiceRow(
  row: Record<string, string>,
  mapping: Record<string, string>
): ValidatedRow {
  const errors: string[] = [];
  const data: Record<string, any> = {};

  const reverseMap: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    reverseMap[field] = row[header] || "";
  }

  const category = reverseMap.category?.trim();
  if (!category) errors.push("Categoria é obrigatória");
  data.category = category || "";

  const service = reverseMap.service?.trim();
  if (!service) errors.push("Serviço é obrigatório");
  data.service = service || "";

  const application = reverseMap.application?.trim();
  if (!application) errors.push("Aplicação é obrigatória");
  data.application = application || "";

  data.price = normalizePrice(reverseMap.price || "");
  data.min_price = normalizePrice(reverseMap.min_price || "");
  data.duration = normalizeDuration(reverseMap.duration || "");
  data.description = reverseMap.description?.trim() || null;

  const status: ValidationStatus = errors.length > 0 ? "error" : "valid";
  return { data, status, errors };
}
