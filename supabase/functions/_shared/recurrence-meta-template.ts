// ---------------------------------------------------------------------------
// Recorrência — conversão de mensagens template para o formato Meta.
// FONTE ÚNICA (importado pelo edge fn recurrence-template-sync, pelo frontend
// via path relativo e pelos testes vitest). Módulo PURO: sem imports Deno/DOM.
// Espelha o catálogo de variáveis de src/lib/recurrenceTemplate.ts.
// ---------------------------------------------------------------------------

/** Variáveis aceitas nas mensagens de recorrência (mesma ordem dos chips do editor). */
export const RECURRENCE_META_VAR_KEYS = [
    "nome_cliente",
    "nome_clinica",
    "servico",
    "aplicacao",
    "preco",
    "profissional",
    "desconto",
    "meses",
    "data_procedimento",
    "dias_do_procedimento",
] as const;

export type RecurrenceMetaVarKey = (typeof RECURRENCE_META_VAR_KEYS)[number];

/** Valores de exemplo enviados à Meta na submissão (example.body_text). */
export const RECURRENCE_META_EXAMPLES: Record<string, string> = {
    nome_cliente: "Maria",
    nome_clinica: "Clínica Exemplo",
    servico: "Botox",
    aplicacao: "Botox Full Face",
    preco: "R$ 1.200,00",
    profissional: "Dra. Ana",
    desconto: "10%",
    meses: "6",
    data_procedimento: "10/01/2026",
    dias_do_procedimento: "180 dias",
};

const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export interface MetaTemplateBody {
    /** Corpo com variáveis numeradas ({{1}}, {{2}}...) — variável repetida reusa o número. */
    body: string;
    /** Nome da variável por posição: variableMap[0] preenche {{1}}. */
    variableMap: string[];
    /** Exemplos alinhados ao variableMap (para example.body_text da Meta). */
    exampleValues: string[];
}

/** Converte mensagem com named vars ({{nome_cliente}}) para o formato Meta ({{n}} + variable_map). */
export function convertRecurrenceMessageToMeta(text: string): MetaTemplateBody {
    const variableMap: string[] = [];
    const body = text.replace(VAR_REGEX, (_match, name: string) => {
        let idx = variableMap.indexOf(name);
        if (idx === -1) {
            variableMap.push(name);
            idx = variableMap.length - 1;
        }
        return `{{${idx + 1}}}`;
    });
    return {
        body,
        variableMap,
        exampleValues: variableMap.map((v) => RECURRENCE_META_EXAMPLES[v] ?? "exemplo"),
    };
}

/** Nome Meta determinístico: rec_<8 primeiros hex do service_name_id>_msg<N>_v<K>. */
export function buildRecurrenceTemplateName(
    serviceNameId: string,
    msgNumber: number,
    version: number,
): string {
    const id8 = serviceNameId.replace(/-/g, "").slice(0, 8).toLowerCase();
    return `rec_${id8}_msg${msgNumber}_v${version}`;
}

/** Nome Meta do template PADRÃO da conta: rec_default_msg<N>_v<K>. */
export function buildDefaultRecurrenceTemplateName(
    msgNumber: number,
    version: number,
): string {
    return `rec_default_msg${msgNumber}_v${version}`;
}

/** Extrai a versão K de um nome rec_*_msg*_v<K>; null se o nome não segue o padrão. */
export function parseRecurrenceTemplateVersion(name: string): number | null {
    const m = /^rec_(?:default|[0-9a-f]{8})_msg[1-3]_v(\d+)$/.exec(name || "");
    return m ? parseInt(m[1], 10) : null;
}

export type RecurrenceBadgeStatus = "approved" | "pending" | "rejected" | null;

/**
 * Badge do serviço = pior status entre os templates de recorrência (R6):
 * qualquer REJECTED/DISABLED → "rejected"; todos APPROVED → "approved";
 * senão (PENDING, PAUSED, mix...) → "pending". Sem templates → null.
 */
export function deriveRecurrenceBadge(
    statuses: Array<string | null | undefined>,
): RecurrenceBadgeStatus {
    const norm = statuses.filter(Boolean).map((s) => (s as string).toUpperCase());
    if (norm.length === 0) return null;
    if (norm.some((s) => s === "REJECTED" || s === "DISABLED")) return "rejected";
    if (norm.every((s) => s === "APPROVED")) return "approved";
    return "pending";
}
