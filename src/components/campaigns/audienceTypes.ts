/** Uma entrada de disparo — um contato pode aparecer mais de uma vez
 *  (ex.: fonte Agendamentos gera 1 entrada por agendamento). */
export interface AudienceEntry {
    contactId: string;
    /** Snapshot das variáveis da fonte para esta entrada (chave → valor). */
    vars: Record<string, string>;
}

/** Seleção de audiência produzida por qualquer builder de origem. */
export interface AudienceSelection {
    entries: AudienceEntry[];
    /** Linhas de arquivo com telefone inválido (visíveis na campanha). */
    invalidRows: Record<string, string>[];
    /** Config da origem (filtros usados) — salvo em campaigns.source_config. */
    config: Record<string, any>;
}

export const EMPTY_AUDIENCE: AudienceSelection = {
    entries: [],
    invalidRows: [],
    config: {},
};

/** Variáveis fornecidas por cada fonte de dados (além de nome/telefone). */
export const SOURCE_VAR_KEYS: Record<string, string[]> = {
    csv: [],
    xml: [],
    crm: ["etapa"],
    tag: [],
    appointments: ["data_agendamento", "hora_agendamento", "profissional", "servico_agendado", "status_agendamento"],
    sales: ["data_venda", "servico_vendido", "valor_venda"],
};

/** Variáveis sempre disponíveis (resolvidas a partir do contato). */
export const BASE_VAR_KEYS = ["nome", "telefone"];

/**
 * Prefixo usado em `campaigns.variable_map` para um valor FIXO digitado pelo
 * cliente (em vez de puxar o dado da fonte). Slug de variável nunca contém ":",
 * então não há colisão com as chaves dinâmicas.
 * Gêmeo em `supabase/functions/campaign-dispatch/index.ts`.
 */
export const FIXED_VAR_PREFIX = "fixo:";

export const isFixedVar = (key?: string | null): boolean =>
    typeof key === "string" && key.startsWith(FIXED_VAR_PREFIX);

export const fixedVarValue = (key?: string | null): string =>
    isFixedVar(key) ? key!.slice(FIXED_VAR_PREFIX.length) : "";

/** Normaliza um cabeçalho de coluna para chave de variável (sem acento, snake_case). */
export function slugVarKey(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
}
