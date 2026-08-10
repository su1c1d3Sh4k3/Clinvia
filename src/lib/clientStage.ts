/**
 * Categorização automática de clientes (contacts.client_stage), mantida por trigger no banco:
 * - 'cliente': venda em categoria != Avaliação
 * - 'lead': apenas vendas na categoria Avaliação
 * - 'contato': nenhuma venda
 */
export type ClientStage = "contato" | "lead" | "cliente";

export const CLIENT_STAGE_LABEL: Record<ClientStage, string> = {
    contato: "Contato",
    lead: "Lead",
    cliente: "Cliente",
};

export const CLIENT_STAGE_BADGE: Record<ClientStage, string> = {
    contato: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    lead: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    cliente: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export const normalizeClientStage = (v?: string | null): ClientStage =>
    v === "lead" || v === "cliente" ? v : "contato";
