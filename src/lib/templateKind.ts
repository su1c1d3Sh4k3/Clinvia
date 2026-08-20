/**
 * Classificação de templates Meta por origem — usada nas abas de Templates
 * (Conexões > Templates) e nos modais de envio via API oficial.
 *
 * - "system": templates automáticos de confirmação/lembrete/pesquisa (sys_*)
 * - "recurrence": templates gerados pelo pipeline de recorrência
 *   (rec_<8hex>_msg[1-3]_v<N> — ver _shared/recurrence-meta-template.ts)
 * - "custom": todo o resto (criados pelo cliente)
 */
export type TemplateKind = "custom" | "system" | "recurrence";

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
    custom: "Personalizados",
    system: "Automáticos",
    recurrence: "Recorrência",
};

export const TEMPLATE_KINDS: TemplateKind[] = ["custom", "system", "recurrence"];

export function getTemplateKind(name: string | null | undefined): TemplateKind {
    const n = name || "";
    if (n.startsWith("sys_")) return "system";
    if (/^rec_[0-9a-f]{8}_msg[1-3]_v\d+$/.test(n)) return "recurrence";
    return "custom";
}
