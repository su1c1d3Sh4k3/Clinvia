// ---------------------------------------------------------------------------
// Recorrência — TEMPLATE PADRÃO da conta (user rules 2026-08-25).
// FONTE ÚNICA (pura, sem Deno/DOM): importada pelos edge fns
// (recurrence-template-sync, recurrence-campaign-generator) e pelo frontend
// via path relativo (mesmo padrão de recurrence-meta-template.ts).
//
// Resolução da mensagem de uma abordagem N:
//   1. service_name.msg_recurrence_N (template personalizado do serviço)
//   2. profiles.recurrence_default_msg_N (template padrão editado pelo cliente)
//   3. DEFAULT_RECURRENCE_MESSAGES[N] (texto padrão embutido abaixo)
// ---------------------------------------------------------------------------

/** Textos padrão das 3 abordagens (Prévia / Vencimento / Pós) — verbatim do user. */
export const DEFAULT_RECURRENCE_MESSAGES: Record<1 | 2 | 3, string> = {
    1: `Oi {{nome_cliente}}, tudo bem?
Aqui é da {{nome_clinica}} 😊
Vi que já faz {{meses}} meses do seu {{servico}} com a {{profissional}}.
Como é que ficou? Você gostou do resultado?`,
    2: `Oi {{nome_cliente}}, tudo bem?
Seu {{servico}} foi em {{data_procedimento}}, já faz {{meses}} meses.
É mais ou menos nesse período que o efeito começa a ceder.
Como você sente que está hoje?`,
    3: `Oi {{nome_cliente}}, tudo bem?
Faz {{meses}} meses do seu {{servico}} — o efeito já deve ter passado por completo.
Se quiser retomar, é só me falar que eu vejo tudo com você.
Tá pensando em fazer de novo?`,
};

/** Template padrão da conta: override do profiles ou o texto embutido. */
export function resolveAccountDefaultMessage(
    msgNumber: 1 | 2 | 3,
    profileMsg: string | null | undefined,
): string {
    const t = (profileMsg || "").trim();
    return t || DEFAULT_RECURRENCE_MESSAGES[msgNumber];
}

/** Mensagem efetiva da abordagem: custom do serviço > padrão da conta > embutido. */
export function resolveRecurrenceMessage(
    msgNumber: 1 | 2 | 3,
    serviceMsg: string | null | undefined,
    profileMsg: string | null | undefined,
): string {
    const s = (serviceMsg || "").trim();
    return s || resolveAccountDefaultMessage(msgNumber, profileMsg);
}

/** true se o serviço usa template personalizado (não o padrão da conta). */
export function serviceUsesCustomTemplate(
    serviceMsgs: Array<string | null | undefined>,
): boolean {
    return serviceMsgs.some((m) => (m || "").trim().length > 0);
}
