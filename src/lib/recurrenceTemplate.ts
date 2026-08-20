// Variáveis do editor de mensagens de recorrência (formato template).
// Fonte única usada pelo RecurrenceTab (chips/validação/preview) e, nas fases
// seguintes, pela conversão named vars -> {{n}} na submissão de templates Meta.

export interface RecurrenceVariable {
    /** chave usada no texto: {{key}} */
    key: string;
    /** rótulo exibido no chip */
    label: string;
    /** valor de exemplo usado no preview */
    example: string;
}

export const RECURRENCE_VARIABLES: RecurrenceVariable[] = [
    { key: "nome_cliente", label: "Nome do Cliente", example: "Maria" },
    { key: "nome_clinica", label: "Nome da Clínica", example: "Clínica Exemplo" },
    { key: "servico", label: "Serviço", example: "Botox" },
    { key: "aplicacao", label: "Aplicação", example: "Botox Full Face" },
    { key: "preco", label: "Preço", example: "R$ 1.200,00" },
    { key: "profissional", label: "Profissional", example: "Dra. Ana" },
];

export const RECURRENCE_VARIABLE_KEYS = RECURRENCE_VARIABLES.map((v) => v.key);

const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Extrai as chaves de variáveis presentes no texto (na ordem, com repetição). */
export function extractRecurrenceVariables(text: string): string[] {
    if (!text) return [];
    const out: string[] = [];
    for (const m of text.matchAll(VAR_REGEX)) out.push(m[1]);
    return out;
}

/** Chaves usadas no texto que NÃO pertencem ao catálogo (erro de validação). */
export function findUnknownRecurrenceVariables(text: string): string[] {
    const known = new Set(RECURRENCE_VARIABLE_KEYS);
    const unknown = new Set<string>();
    for (const key of extractRecurrenceVariables(text)) {
        if (!known.has(key)) unknown.add(key);
    }
    return [...unknown];
}

/** Substitui as variáveis conhecidas pelos valores informados (default: exemplos). */
export function renderRecurrencePreview(
    text: string,
    values?: Partial<Record<string, string>>,
): string {
    if (!text) return "";
    const map = new Map<string, string>(
        RECURRENCE_VARIABLES.map((v) => [v.key, values?.[v.key] ?? v.example]),
    );
    return text.replace(VAR_REGEX, (full, key: string) => map.get(key) ?? full);
}

/** Insere {{key}} na posição do cursor, retornando o novo texto e cursor. */
export function insertRecurrenceVariable(
    text: string,
    cursor: number,
    key: string,
): { text: string; cursor: number } {
    const safeCursor = Math.max(0, Math.min(cursor ?? text.length, text.length));
    const token = `{{${key}}}`;
    const next = text.slice(0, safeCursor) + token + text.slice(safeCursor);
    return { text: next, cursor: safeCursor + token.length };
}
