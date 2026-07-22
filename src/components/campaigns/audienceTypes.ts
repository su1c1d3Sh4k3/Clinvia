/** Seleção de audiência produzida por qualquer builder de origem. */
export interface AudienceSelection {
    contactIds: string[];
    /** Linhas de arquivo com telefone inválido (visíveis na campanha). */
    invalidRows: Record<string, string>[];
    /** Config da origem (filtros usados) — salvo em campaigns.source_config. */
    config: Record<string, any>;
}

export const EMPTY_AUDIENCE: AudienceSelection = {
    contactIds: [],
    invalidRows: [],
    config: {},
};
