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
