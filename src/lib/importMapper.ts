import Fuse from "fuse.js";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  synonyms: string[];
}

export const CONTACT_FIELDS: FieldDef[] = [
  { key: "push_name", label: "Nome", required: true, synonyms: ["nome", "name", "paciente", "cliente", "push_name", "nome_completo", "nome_paciente", "nome_cliente", "full_name", "patient_name", "razao_social"] },
  { key: "number", label: "WhatsApp", required: true, synonyms: ["whatsapp", "celular", "telefone", "phone", "tel", "mobile", "numero", "fone", "cell", "whats", "telefone_celular", "cel"] },
  { key: "email", label: "Email", synonyms: ["email", "e-mail", "e_mail", "mail", "correio", "email_contato"] },
  { key: "cpf", label: "CPF", synonyms: ["cpf", "documento", "doc", "cpf_cnpj", "cnpj", "documento_fiscal"] },
  { key: "company", label: "Empresa", synonyms: ["empresa", "company", "clinica", "razao", "fantasia", "nome_empresa"] },
  { key: "instagram", label: "Instagram", synonyms: ["instagram", "insta", "ig", "@instagram", "rede_social"] },
  { key: "phone", label: "Telefone fixo", synonyms: ["fixo", "telefone_fixo", "landline", "residencial", "comercial"] },
];

export const SERVICE_FIELDS: FieldDef[] = [
  { key: "category", label: "Categoria", required: true, synonyms: ["categoria", "category", "grupo", "group", "area", "tipo_servico", "departamento"] },
  { key: "service", label: "Serviço", required: true, synonyms: ["servico", "service", "procedimento", "procedure", "nome_servico", "nome_procedimento", "tratamento"] },
  { key: "application", label: "Aplicação", required: true, synonyms: ["aplicacao", "application", "variacao", "tipo", "nome_aplicacao", "subtipo", "especificacao", "item"] },
  { key: "price", label: "Preço (R$)", synonyms: ["preco", "price", "valor", "value", "custo", "preco_venda", "valor_venda"] },
  { key: "min_price", label: "Preço mínimo", synonyms: ["preco_minimo", "min_price", "valor_minimo", "piso", "desconto_max"] },
  { key: "duration", label: "Duração (min)", synonyms: ["duracao", "duration", "tempo", "minutes", "minutos", "tempo_min", "tempo_execucao"] },
  { key: "description", label: "Descrição", synonyms: ["descricao", "description", "obs", "observacao", "detalhes", "notas"] },
];

/** Auto-map spreadsheet headers to platform fields using fuzzy matching */
export function autoMapColumns(
  headers: string[],
  fields: FieldDef[]
): Record<string, string> {
  const mapping: Record<string, string> = {}; // header → field.key
  const usedFields = new Set<string>();

  // Build a flat list of {synonym, fieldKey} for Fuse
  const entries = fields.flatMap((f) =>
    [f.key, f.label, ...f.synonyms].map((s) => ({
      text: s.toLowerCase().replace(/[^a-z0-9]/g, ""),
      fieldKey: f.key,
    }))
  );

  const fuse = new Fuse(entries, {
    keys: ["text"],
    threshold: 0.4,
    includeScore: true,
  });

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalized) continue;

    const results = fuse.search(normalized);
    const best = results.find((r) => !usedFields.has(r.item.fieldKey));

    if (best && (best.score ?? 1) < 0.4) {
      mapping[header] = best.item.fieldKey;
      usedFields.add(best.item.fieldKey);
    }
  }

  return mapping;
}
