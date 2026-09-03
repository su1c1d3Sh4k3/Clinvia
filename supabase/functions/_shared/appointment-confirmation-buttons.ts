// supabase/functions/_shared/appointment-confirmation-buttons.ts
// -----------------------------------------------------------------------------
// Fonte única dos rótulos dos botões das mensagens automáticas de confirmação.
// Os mesmos textos estão nos templates Meta (sys_confirm_24h_v1 /
// sys_feedback_24h_v1) e nos botões UAZAPI montados pelo
// appointment-confirmation-cron.
//
// REGRA (decisão do usuário): a sessão de confirmação só assume a conversa
// quando o cliente toca no botão (ou digita EXATAMENTE o rótulo). Qualquer outro
// texto é entregue à IA, que passa a conduzir o atendimento.
// -----------------------------------------------------------------------------

export const AC_BUTTON_LABELS: Record<string, string> = {
    // Fluxo confirm_24h
    ac_confirm: "Sim, pode confirmar",
    ac_reschedule: "Vou precisar reagendar",
    ac_cancel: "Não vou poder ir",
    // Fluxo feedback_24h
    ac_fb_5: "Excelente",
    ac_fb_4: "Muito bom",
    ac_fb_3: "Regular",
    ac_fb_2: "Precisa melhorar",
    ac_fb_1: "Insatisfeito",
};

const AC_BUTTON_IDS = new Set(Object.keys(AC_BUTTON_LABELS));

/** minúsculas, sem acento, espaços colapsados — o rótulo em si não muda. */
function normalize(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

const ID_BY_LABEL = new Map(
    Object.entries(AC_BUTTON_LABELS).map(([id, label]) => [normalize(label), id]),
);

/**
 * Resolve o botão a partir do id enviado pelo provedor ou do texto exibido.
 *
 * O match é EXATO de propósito: "sim", "opção 1" ou "pode confirmar sim" NÃO
 * contam como botão — vão para a IA. A heurística antiga (includes) sequestrava
 * mensagens comuns do cliente e devolvia o robô de "utilize uma das opções".
 */
export function matchAcButtonId(
    buttonId?: string | null,
    text?: string | null,
): string {
    const id = (buttonId || "").trim();
    if (AC_BUTTON_IDS.has(id)) return id;

    const normalized = normalize(text || "");
    return normalized ? ID_BY_LABEL.get(normalized) || "" : "";
}

/**
 * Estados em que a resposta esperada JÁ é texto livre (o cliente escolheu um
 * botão antes). Nesses casos a sessão continua dona da conversa e a IA não é
 * chamada.
 */
export const AC_FREE_TEXT_STATES = new Set([
    "awaiting_cancel_reason",
    "awaiting_feedback_detail",
]);
