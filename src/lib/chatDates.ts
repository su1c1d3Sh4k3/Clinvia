// Datas da timeline do chat — fonte única para MessageList (inbox),
// MessageBubble e ConversationChatModal.
//
// Regras (user, 2026-08-25):
// - Toda mensagem mostra data + hora ("25/08/2026 14:32").
// - A primeira mensagem de cada dia ganha um separador de data centralizado,
//   no mesmo estilo do pill de transferência — linha do tempo por blocos de dia.

/** true quando os dois timestamps caem no mesmo dia (fuso local). */
export function isSameChatDay(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
    return da.toDateString() === db.toDateString();
}

/** "Hoje" | "Ontem" | "segunda-feira, 25/08/2026" para o separador de dia. */
export function chatDayLabel(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Hoje";
    if (d.toDateString() === yesterday.toDateString()) return "Ontem";

    const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
    const date = d.toLocaleDateString("pt-BR");
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date}`;
}

/** "25/08/2026 14:32" — data + hora exibidas junto ao horário da mensagem. */
export function chatDateTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}
